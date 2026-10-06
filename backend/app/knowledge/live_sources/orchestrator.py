"""PRD live v3 §5, §9: search every enabled connector at once, inside one
bounded window, and keep whatever evidence arrives.

- Every enabled connector that serves the question's language starts at the
  same moment; none waits for another, none is primary (§5). A connector
  that does not serve the language is recorded as `unsupported_language`
  and never called (no machine translation of a religious text).
- Each connector: one search, then its best `records_per_source` records
  fetched in full, concurrently. A snippet alone is never evidence (A11).
- One shared monotonic deadline: the window ends at the earlier of
  ASK_LIVE_WINDOW_SECONDS and the time the answer still needs. Tasks still
  running then are cancelled; evidence they already fetched is kept and the
  connector is reported `cancelled` (§5: completed results are used, stuck
  tasks are cancelled, nothing claims a source was read when it was not).
- Failures are isolated: one connector's error, timeout or crash never
  touches the others' results (A06, A23).
- No database session here: tasks share nothing but the transport budget
  (§9: no AsyncSession across concurrent tasks).
- The trace holds codes, counts and durations, never text (A26)."""

import asyncio
import logging
import time
from dataclasses import dataclass, field

from app.core.config import get_settings
from app.knowledge.live_sources import evidence, http, registry
from app.knowledge.live_sources import types as T

log = logging.getLogger("rafeeq.live")


@dataclass
class Collection:
    results: list[T.SourceResult] = field(default_factory=list)
    evidence: list[T.Evidence] = field(default_factory=list)
    window_ms: int = 0
    calls: int = 0

    @property
    def attempted(self) -> list[T.SourceResult]:
        return [r for r in self.results if r.attempted]

    @property
    def failed(self) -> list[T.SourceResult]:
        return [r for r in self.attempted if r.status in ("unavailable", "cancelled")]

    @property
    def clean(self) -> list[T.SourceResult]:
        """Searches that completed: they either found evidence or honestly found none."""
        return [r for r in self.attempted if r.status in ("ok", "no_results")]


async def _run_one(
    conn: registry.Connector,
    res: T.SourceResult,
    client,
    shared: http.Budget,
    terms: str,
    question: str,
    lang: str,
    request_id: str,
) -> None:
    """Fills `res` in place, so a cancelled task still leaves what it found."""
    st = get_settings()
    started = time.monotonic()
    budget = http.SourceBudget(shared, st.ask_live_max_calls_per_source, hosts=conn.hosts)
    call = registry.Call(client, budget, st.ask_live_request_timeout_seconds)
    res.attempted = True
    try:
        try:
            res.candidates = await conn.adapter.search(call, terms, lang, st.ask_live_records_per_source)
        except http.FetchError as e:
            res.status, res.reason_code = "unavailable", e.code
            return
        if not res.candidates:
            res.status, res.reason_code = "no_results", T.NO_RESULTS
            return

        async def one(c: T.Candidate) -> list[T.Evidence]:
            rec = await conn.adapter.fetch(call, c)
            found = evidence.from_record(
                rec,
                c,
                question=question,
                lang=lang,
                provider=next(iter(sorted(conn.hosts))),
                request_id=request_id,
                chunks_per_record=st.ask_live_chunks_per_record,
            )
            res.evidence.extend(found)  # kept even if this task is cancelled later
            return found

        outcomes = await asyncio.gather(*(one(c) for c in res.candidates), return_exceptions=True)
        errors = [o for o in outcomes if isinstance(o, BaseException)]
        for o in errors:
            if not isinstance(o, http.FetchError | asyncio.CancelledError):
                log.error("live fetch failed in %s: %s", conn.id, type(o).__name__)
        if res.evidence:
            res.status, res.reason_code = "ok", None
        elif errors and len(errors) == len(outcomes):
            # Snippets only: the records could not be read, so there is no evidence (A11).
            res.status = "unavailable"
            res.reason_code = errors[0].code if isinstance(errors[0], http.FetchError) else T.FETCH_FAILED
        else:
            res.status, res.reason_code = "no_results", "empty_records"
    except asyncio.CancelledError:
        res.status, res.reason_code = "cancelled", T.WINDOW_CLOSED
        raise
    except Exception as e:  # a connector bug must not touch the other connectors (A23)
        log.error("live connector %s failed: %s", conn.id, type(e).__name__)
        res.status, res.reason_code = "unavailable", T.INTERNAL_ERROR
    finally:
        res.calls = budget.calls
        res.duration_ms = int((time.monotonic() - started) * 1000)


async def collect(question: str, canonical: str, lang: str, request_id: str, window_s: float) -> Collection:
    """Search and fetch every enabled connector in parallel within `window_s`."""
    st = get_settings()
    out = Collection()
    started = time.monotonic()
    terms = evidence.search_terms(canonical)
    tasks: list[asyncio.Task] = []
    running: list[T.SourceResult] = []
    shared = http.Budget(st.ask_live_max_calls, time.monotonic() + max(0.0, window_s))
    client = http.new_client(st.ask_live_user_agent)
    try:
        for conn in registry.enabled():
            res = T.SourceResult(conn.id, attempted=False, status="unavailable", request_id=request_id)
            out.results.append(res)
            blocked = conn.blocked_reason()
            if blocked:
                res.reason_code = blocked  # configured, but not usable from the backend (A13)
                continue
            if lang not in conn.langs:
                res.status, res.reason_code = "unsupported_language", T.UNSUPPORTED_LANGUAGE
                continue
            if not terms or window_s <= http.MIN_REQUEST_SECONDS:
                res.reason_code = T.WINDOW_CLOSED if terms else T.NO_RESULTS
                res.status = "unavailable" if terms else "no_results"
                continue
            running.append(res)
            tasks.append(asyncio.create_task(_run_one(conn, res, client, shared, terms, question, lang, request_id)))
        if tasks:
            _, pending = await asyncio.wait(tasks, timeout=max(0.0, shared.remaining()))
            for t in pending:
                t.cancel()
            # Let every cancelled task finish its cleanup: nothing is left running (A23).
            await asyncio.gather(*tasks, return_exceptions=True)
        for res in running:
            if res.status == "cancelled" and not res.reason_code:
                res.reason_code = T.WINDOW_CLOSED
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()
        await client.aclose()
    out.evidence = evidence.rank([e for r in out.results for e in r.evidence])
    out.window_ms = int((time.monotonic() - started) * 1000)
    out.calls = shared.calls
    return out
