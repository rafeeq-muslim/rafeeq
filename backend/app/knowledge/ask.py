"""KNW-01: the sourced answer. POST /api/ask (guests allowed).

Pipeline (plan §1, docs/engineering/implementation/KNW-01.md, reliability
PRD §14.2):
  validate → request context and total deadline → danger / manipulation /
  learning-guide screens on the original text → search-only canonical form
  (screened too) → router (or, if it is down, only an exact approved FAQ
  match) → approved FAQ for general questions (flag) → retrieval with
  diagnostics, expanded once if empty → composer (passages only) → code
  checks + support check → one bounded repair if the rejection is
  repairable, then every check again → source cards (all present) →
  response whose Quran/hadith text comes from the stored records by id.

Outcomes keep "no evidence" apart from failures (reliability R4):
  answered / cached · no_source (retrieval_empty | insufficient_evidence) ·
  verification_failed (verification_rejected) · unavailable
  (temporarily_unavailable | deadline_exceeded | service_limit) · danger ·
  refused · out_of_scope · learning_guide.
The internal `detail` code (e.g. verifier_unavailable) and the stage trace
go to `knw_answer_log` with the random `ask_id`, never to the app.

PRD live v3 (ASK_SOURCE_POLICY=live-enabled-sources-any-sufficient-v3, off
by default): step 7 also reads the enabled live connectors (islamqa.info,
binbaz.org.sa, islamenc.com) at question time, in parallel with the local
index of the other approved sources, inside one bounded window
(live_sources/). Any one suitable source is enough; only the sources the
verified answer cites are shown; a connector's failure never blocks an
answer another source supports. The response then also carries
`source_policy`, `used_source_ids` and `live_search` (real events only).

Not streamed: the verifier must pass the whole answer before anything is
shown (rules.md §2.3). Nothing here stores the question text (plan 4.9);
the provider receives the question and passages only (rules.md §2.6).
"""

import asyncio
import logging
import time
import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.deps import OptionalUser, Session
from app.core.events import publish
from app.knowledge import approved, query_normalization, source_policy, tasks
from app.knowledge.ai import agents, screen
from app.knowledge.ai.errors import AiUnavailable, BudgetExceeded, CallBudgetExhausted, DeadlineExceeded
from app.knowledge.live_sources import orchestrator as live_orchestrator
from app.knowledge.live_sources import registry as live_registry
from app.knowledge.live_sources.types import Evidence, SourceResult
from app.knowledge.models import AnswerLog, Passage, Source
from app.knowledge.request_context import RequestContext, current
from app.knowledge.search import RetrievalResult, retrieve
from app.knowledge.verify import VerificationResult, cited_ids, verify

log = logging.getLogger("rafeeq.ask")
router = APIRouter(prefix="/api", tags=["ask"])
Lang = Literal["ar", "en", "tl"]
ESCALATE_ROUTES = ("personal", "sensitive")
VERIFY_RESERVE_S = 8.0  # kept free for the support check while composing
MIN_COMPOSE_S = 6.0  # a composition needs at least this much time to be worth starting
EXPANSION_NEW = 4  # passages an expansion round may add to the context
# PRD live v3 §9: time the answer still needs after the collection window
# (composition, the support check and the reply margin).
LIVE_ANSWER_RESERVE_S = VERIFY_RESERVE_S + MIN_COMPOSE_S + 5.0
LIVE_RRF_K = 60
DEDUP_SECONDS = 120.0  # A15: the same client_request_id within this time is the same attempt

# Public reason codes (PRD §5 R4) and whether a retry can help.
RETRYABLE = {
    "retrieval_empty": False,
    "insufficient_evidence": False,
    "verification_rejected": False,
    "temporarily_unavailable": True,
    "deadline_exceeded": True,
    "service_limit": False,  # budget used up or service not configured: a retry cannot help today
}

Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=600)]


class AskIn(BaseModel):
    question: Question
    lang: Lang
    consent_objectives: bool = False  # KNW-10 R5: the device flag `askConsent`, off by default
    # KNW-01 reliability §6: optional, for tracing only; they never change the answer.
    client_request_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{8,64}$")
    entrypoint: Literal["typed", "suggestion"] | None = None
    suggestion_id: str | None = Field(default=None, pattern=r"^[a-z0-9_]{1,40}$")


def _base(ask_id: str, lang: str) -> dict[str, Any]:
    return {
        "ask_id": ask_id,
        "outcome": "",
        "reason_code": None,
        "retryable": False,
        "route": None,
        "level": None,
        "answer": "",
        "sources": [],
        "notes": [],
        "should_escalate": False,
        "handoff": None,
        "objective_id": None,
        "lang": lang,
    }


class Result:
    """The response plus the events to publish (kept apart so the KNW-04
    runner can inspect them without writing), the verifier codes, the
    internal detail code and the stage trace (no text)."""

    def __init__(
        self,
        body: dict[str, Any],
        events: list[tuple[str, dict]] | None = None,
        checks: list[str] | None = None,
        detail: str | None = None,
    ):
        self.body = body
        self.events = events or []
        self.checks = checks or []
        self.detail = detail
        self.trace: dict[str, Any] = {}


class _Track:
    """What the trace needs beyond the context: per-source counters (KNW-02 SC6)."""

    def __init__(self) -> None:
        self.sources: dict[str, dict[str, Any]] = {}
        self.cited: list[str] = []
        self.verified = False
        self.passage_source: dict[str, str] = {}
        # PRD live v3: the attempt's live search results and the cards of its evidence.
        self.live: list[SourceResult] | None = None
        self.live_cards: dict[str, dict[str, Any]] = {}
        self.live_window_ms = 0

    def add_retrieval(self, ret: RetrievalResult) -> None:
        for sid, e in ret.sources.items():
            if sid not in self.sources:
                self.sources[sid] = dict(e)
                continue
            cur = self.sources[sid]
            for key in ("vector", "text", "below_threshold", "context"):
                if key in e:
                    cur[key] = cur.get(key, 0) + e[key]
            if cur.get("exclusion") in ("no_relevant_hits", "below_threshold", "context_limit") and cur.get("context"):
                cur.pop("exclusion")
        for p in ret.passages:
            self.passage_source[p["id"]] = p["source_id"]

    def add_live(self, results: list[SourceResult], items: list[Evidence], lang: str, window_ms: int) -> None:
        self.live, self.live_window_ms = results, window_ms
        for e in items:
            self.passage_source[e.evidence_id] = e.source_id
            self.live_cards[e.evidence_id] = live_card(e, lang)

    def summary(self) -> dict[str, dict[str, Any]]:
        cited: dict[str, int] = {}
        for pid in self.cited:
            sid = self.passage_source.get(pid)
            if sid:
                cited[sid] = cited.get(sid, 0) + 1
        out = {}
        for sid, e in self.sources.items():
            row = dict(e)
            if row.get("eligible"):
                row["cited"] = cited.get(sid, 0)
                row["verified"] = row["cited"] if self.verified else 0
                if "exclusion" not in row and row.get("context"):
                    if not row["cited"]:
                        row["exclusion"] = "not_cited"
                    elif not self.verified:
                        row["exclusion"] = "verification_rejected"
            out[sid] = row
        return out


def _fixed(r: dict[str, Any], outcome: str, reply: str, route: str | None = None) -> dict[str, Any]:
    r.update(outcome=outcome, answer=screen.fixed(reply, r["lang"]))
    if route:
        r["route"] = route
    return r


def _danger(r: dict[str, Any], detector: str) -> Result:
    _fixed(r, "danger", "danger", "danger")
    r.update(should_escalate=True, handoff={"kind": "urgent", "lang": r["lang"]})
    # rules.md §2.9 / KNW-01 R5: the event never carries the question text or identity.
    return Result(r, [("DangerDetected", {"ask_id": r["ask_id"], "lang": r["lang"], "detector": detector})])


def _escalate(r: dict[str, Any], outcome: str, reason_code: str, detail: str, checks: list[str] | None = None) -> Result:
    """A fixed reply with «أريد إنسانًا»; no generated text, no source cards."""
    _fixed(r, outcome, outcome)
    r.update(
        reason_code=reason_code,
        retryable=RETRYABLE[reason_code],
        should_escalate=True,
        handoff={"kind": "escalation", "lang": r["lang"]},
        sources=[],
        notes=[],
        objective_id=None,
    )
    event = {"ask_id": r["ask_id"], "lang": r["lang"], "route": r["route"], "reason": outcome}
    return Result(r, [("EscalationRequested", event)], checks, detail)


def _unavailable(r: dict[str, Any], reason_code: str, detail: str, checks: list[str] | None = None) -> Result:
    return _escalate(r, "unavailable", reason_code, detail, checks)


def _unavailable_from(r: dict[str, Any], e: AiUnavailable | None, stage: str) -> Result:
    """Map an AI-layer failure to the public reason and an internal detail code."""
    if isinstance(e, BudgetExceeded):
        return _unavailable(r, "service_limit", "daily_budget_exceeded" if str(e) == "daily_budget" else "budget_exceeded")
    if e is not None and str(e) == "no_key":
        return _unavailable(r, "service_limit", "not_configured")
    if isinstance(e, DeadlineExceeded):
        return _unavailable(r, "deadline_exceeded", f"{stage}_deadline")
    if isinstance(e, CallBudgetExhausted):
        return _unavailable(r, "temporarily_unavailable", "call_budget_exhausted")
    return _unavailable(r, "temporarily_unavailable", f"{stage}_unavailable")


def _no_evidence(r: dict[str, Any], status: str, reason_code: str, checks: list[str] | None = None) -> Result:
    """§14.1 rules 2 and 4: an empty or insufficient result from a degraded
    or failed retrieval is a failure, not a claim that the sources lack it."""
    if status == "unavailable":
        return _unavailable(r, "temporarily_unavailable", "retrieval_db_error", checks)
    if status == "degraded":
        return _unavailable(r, "temporarily_unavailable", "retrieval_degraded_no_evidence", checks)
    # PRD live v3 §10: a failure or timeout kept the answer from being decided.
    if status == "live_unavailable":
        return _unavailable(r, "temporarily_unavailable", "live_sources_unavailable", checks)
    if status == "live_degraded":
        return _unavailable(r, "temporarily_unavailable", "live_degraded_no_evidence", checks)
    return _escalate(r, "no_source", reason_code, reason_code, checks)


def _verification_failed(r: dict[str, Any], v: VerificationResult, detail: str = "verification_rejected") -> Result:
    return _escalate(r, "verification_failed", "verification_rejected", detail, v.codes)


def live_card(e: Evidence, lang: str) -> dict[str, Any]:
    """PRD live v3 §6, §7.5: the card of a live record shows the text fetched
    from the source in this attempt, its link and when it was read; the
    model never writes it. `live: true` keeps it apart from local records."""
    return {
        "id": e.evidence_id,
        "source_id": e.source_id,
        "source_name": live_registry.label(e.source_id, lang),
        "kind": e.kind,
        "lang": e.lang,
        "ref": {"title": e.title, "external_id": e.external_record_id},
        "ref_key": e.external_record_id,
        "quote_text": e.source_text,
        "arabic_text": None,
        "translation": None,
        "grade": None,
        "attribution": e.attribution,
        "title": e.title,
        "origin_url": e.canonical_url,
        "version": f"live:{e.retrieved_at}",
        "retrieved_at": e.retrieved_at,
        "live": True,
    }


async def source_cards(
    session: AsyncSession, ids: list[str], allowed: set[str] | None = None, live: dict[str, dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """Source cards for the cited ids, with Quran/hadith text from the
    database (rules.md §1.3): the passage's own text plus the Arabic ayah or
    Arabic hadith of the same record. With `allowed`, passages of any other
    source are left out (the caller then refuses a half-sourced answer).
    Every cited passage keeps its own card; the app groups them for display
    (reliability R8). `live`: the cards of this attempt's live evidence
    (PRD live v3), used for their ids instead of the database."""
    if not ids:
        return []
    live = live or {}
    db_ids = [i for i in ids if i not in live]
    rows = {p.id: p for p in await session.scalars(select(Passage).where(Passage.id.in_(db_ids)))} if db_ids else {}
    names = {s.id: s.name for s in await session.scalars(select(Source))}
    ayah_keys = {p.ref_key for p in rows.values() if p.source_id == "quranenc" and p.kind != "quran_arabic"}
    arabic = {}
    if ayah_keys:
        arabic = {
            p.ref_key: p.quote_text
            for p in await session.scalars(
                select(Passage).where(Passage.source_id == "quranenc", Passage.kind == "quran_arabic", Passage.ref_key.in_(ayah_keys))
            )
        }
    cards = []
    for i in ids:
        if i in live:
            cards.append(live[i])
            continue
        p = rows.get(i)
        if p is None or (allowed is not None and p.source_id not in allowed):
            continue
        meta = p.meta or {}
        card = {
            "id": p.id,
            "source_id": p.source_id,
            "source_name": names.get(p.source_id, p.source_id),
            "kind": p.kind,
            "lang": p.lang,
            "ref": p.ref,
            "ref_key": p.ref_key,
            "quote_text": p.quote_text,
            "arabic_text": None,
            "translation": meta.get("translation_key"),
            "grade": meta.get("grade"),
            "attribution": meta.get("attribution"),
            "title": meta.get("title") or meta.get("book_title") or (p.ref or {}).get("title"),
            "origin_url": p.origin_url,
            "version": p.version,
        }
        if p.source_id == "quranenc" and p.kind != "quran_arabic":
            card["arabic_text"] = arabic.get(p.ref_key)
        elif p.kind == "hadith" and p.lang != "ar":
            card["arabic_text"] = meta.get("hadeeth_ar")
        cards.append(card)
    return cards


async def _serve_approved(session: AsyncSession, r: dict[str, Any], question: str, *, exact_only: bool) -> Result | None:
    """Reliability R7 (flag ASK_APPROVED_FAQ_ENABLED): a valid approved answer."""
    entry = await approved.find(session, question, r["lang"], route=r["route"], level=r["level"], exact_only=exact_only)
    if entry is None:
        return None
    ids = approved.entry_ids(entry)
    allowed = set((await source_policy.eligible_sources(session)).sources)
    cards = await source_cards(session, ids, allowed)
    if len(cards) != len(ids) or not cards:
        return None  # a source is missing: never show it half-sourced
    r.update(outcome="cached", answer=entry["answer"], sources=cards, route=r["route"] or "general")
    return Result(r, detail="approved_answer")


async def _retrieve_round(
    session: AsyncSession,
    ctx: RequestContext,
    track: _Track,
    query: str,
    lang: str,
    version: str,
    exclude: set[str] | None = None,
    sources: list[str] | None = None,
) -> RetrievalResult:
    ctx.retrieval_rounds_used += 1
    t = time.monotonic()
    ret = await retrieve(session, query, lang, sources=sources, version=version, exclude_ids=frozenset(exclude or ()))
    ctx.stage("retrieval", t, round=ctx.retrieval_rounds_used, **ret.trace())
    track.add_retrieval(ret)
    return ret


async def _expand(
    session: AsyncSession,
    ctx: RequestContext,
    track: _Track,
    q: query_normalization.QueryForms,
    lang: str,
    used: set[str],
    first_empty: bool,
) -> RetrievalResult | None:
    """The single expansion round (R3, §14.2): the predefined variant if there
    is one, else the next candidates of the same query. Shares the round
    counter; never a third round."""
    if ctx.retrieval_rounds_used >= ctx.max_retrieval_rounds:
        return None
    query = q.variants[0] if q.variants else q.canonical
    if first_empty and query == q.canonical:
        return None  # the same query over the same data would be empty again
    return await _retrieve_round(session, ctx, track, query, lang, q.version, used)


def _merge(first: list[dict[str, Any]], extra: list[dict[str, Any]], k: int) -> list[dict[str, Any]]:
    new = [p for p in extra if p["id"] not in {x["id"] for x in first}][:EXPANSION_NEW]
    return [*first[: max(k - len(new), 0)], *new]


def _fuse(local: list[dict[str, Any]], live: list[dict[str, Any]], k: int) -> list[dict[str, Any]]:
    """PRD live v3 §7.1: local and live candidates by their rank in their own
    list (reciprocal rank), then a fixed tie-break by id. No source name
    enters the order."""
    score: dict[str, float] = {}
    by_id: dict[str, dict[str, Any]] = {}
    for lst in (local, live):
        for rank, p in enumerate(lst):
            if p["id"] in by_id:
                continue
            by_id[p["id"]] = p
            score[p["id"]] = 1 / (LIVE_RRF_K + rank)
    return [by_id[i] for i in sorted(score, key=lambda i: (-score[i], i))[:k]]


async def _live_round(
    session: AsyncSession, ctx: RequestContext, track: _Track, q: query_normalization.QueryForms, lang: str, question: str
) -> tuple[list[dict[str, Any]], str]:
    """PRD live v3 §5: the enabled live connectors, in parallel with the local
    index of the other approved sources. The local copy of a live connector
    is not used: in this mode its evidence must come from the live source
    (§8). Only this coroutine uses the database session; the live tasks
    never see it (§9). Returns (passages, status)."""
    st = get_settings()
    t = time.monotonic()
    live_ids = {c.id for c in live_registry.enabled()}
    local_ids = [s for s in source_policy.configured_sources() if s not in live_ids]
    window = min(st.ask_live_window_seconds, ctx.remaining() - LIVE_ANSWER_RESERVE_S)
    task = asyncio.create_task(live_orchestrator.collect(question, q.canonical, lang, ctx.ask_id, window))
    try:
        local = await _retrieve_round(session, ctx, track, q.canonical, lang, q.version, sources=local_ids)
    except BaseException:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        raise
    coll = await task
    ctx.max_retrieval_rounds = ctx.retrieval_rounds_used  # one live round: no expansion
    live_passages = [e.passage(live_registry.label(e.source_id, lang)) for e in coll.evidence]
    track.add_live(coll.results, coll.evidence, lang, coll.window_ms)
    local_used = local.reason not in ("no_eligible_sources", "no_passages_for_lang")
    failed = len(coll.failed) + (1 if local_used and local.status != "complete" else 0)
    clean = len(coll.clean) + (1 if local_used and local.status == "complete" else 0)
    status = "complete" if not failed else "live_unavailable" if not clean else "live_degraded"
    ctx.stage(
        "live",
        t,
        status=status,
        window_ms=coll.window_ms,
        calls=coll.calls,
        evidence=len(coll.evidence),
        sources={x.source_id: x.status for x in coll.results},
    )
    return _fuse(local.passages, live_passages, st.knw_search_k), status


def _same_output(a: dict[str, Any], b: dict[str, Any] | None) -> bool:
    return b is not None and (a.get("answer") or "").strip() == (b.get("answer") or "").strip() and a.get("sources") == b.get("sources")


async def _pipeline(
    session: AsyncSession, ctx: RequestContext, track: _Track, r: dict[str, Any], question: str, lang: str, consent: bool
) -> Result:
    st = get_settings()
    t = time.monotonic()
    # 1. Danger: phrases first, no model, no network (plan 2.6, 4.2).
    if screen.is_danger(question):
        ctx.stage("screen", t, result="danger")
        return _danger(r, "phrase")
    # 2. Attempts to bypass the rules (R6).
    if screen.is_manipulation(question):
        ctx.stage("screen", t, result="manipulation")
        return Result(_fixed(r, "refused", "manipulation", "manipulation"))
    # 3. "What should I learn now?" goes to the learning guide (KNW-10 R3).
    if screen.is_learning_guide(question):
        ctx.stage("screen", t, result="learning_guide")
        return Result(_fixed(r, "learning_guide", "learning_guide"))
    # 4. Search-only forms (R2); the screens also run on every derived form.
    q = query_normalization.build(question, lang)
    for form in (q.canonical, *q.variants):
        if form != question and screen.is_danger(form):
            ctx.stage("screen", t, result="danger")
            return _danger(r, "phrase")
        if form != question and screen.is_manipulation(form):
            ctx.stage("screen", t, result="manipulation")
            return Result(_fixed(r, "refused", "manipulation", "manipulation"))
    ctx.stage("screen", t, result="pass", normalization=q.version, variants=len(q.variants))

    # 5. Route and level, with the original question.
    t = time.monotonic()
    try:
        routed = await agents.route_question(question, lang)
    except AiUnavailable as e:
        ctx.stage("route", t, status="unavailable")
        if st.ask_approved_faq_enabled:
            cached = await _serve_approved(session, r, question, exact_only=True)
            if cached:
                return cached
        return _unavailable_from(r, e, "router")
    r.update(route=routed["route"], level=routed["level"])
    ctx.stage("route", t, status="ok", route=r["route"], level=r["level"])
    if r["route"] == "danger":
        return _danger(r, "router")
    if r["route"] == "manipulation":
        return Result(_fixed(r, "refused", "manipulation"))
    if r["route"] == "out_of_scope":
        return Result(_fixed(r, "out_of_scope", "out_of_scope"))

    # 6. Approved answer for an eligible general question (R7, flag).
    if st.ask_approved_faq_enabled:
        cached = await _serve_approved(session, r, question, exact_only=False)
        if cached:
            ctx.stage("faq", t, status="hit")
            return cached

    # 7. Retrieve in the asker's language only; expand once if empty.
    # PRD live v3: the live connectors and the local index, in parallel.
    if live_registry.live_on():
        passages, status = await _live_round(session, ctx, track, q, lang, question)
    else:
        ret = await _retrieve_round(session, ctx, track, q.canonical, lang, q.version)
        status = ret.status
        passages = ret.passages
        if not passages:
            ret2 = await _expand(session, ctx, track, q, lang, set(), first_empty=True)
            if ret2 is not None:
                passages = ret2.passages
                status = ret2.status if ret2.status != "complete" else status
    if not passages:
        return _no_evidence(r, status, "retrieval_empty")
    retrieved = {p["id"]: p for p in passages}

    # 8. Compose from the passages only; verify; one bounded repair or one
    # recomposition after an expansion (shared compose-round counter).
    mode, prev, v = "compose", None, None
    while True:
        if not ctx.can_afford(2, VERIFY_RESERVE_S + MIN_COMPOSE_S):
            if mode == "repair" and v is not None:
                return _verification_failed(r, v, "repair_not_affordable")
            no_calls = ctx.calls_used + 2 > ctx.max_calls
            return _unavailable(
                r,
                "temporarily_unavailable" if no_calls else "deadline_exceeded",
                "call_budget_exhausted" if no_calls else "compose_deadline",
            )
        ctx.compose_rounds_used += 1
        ctx.reserve_seconds = VERIFY_RESERVE_S
        t = time.monotonic()
        try:
            if mode == "compose":
                out = await agents.compose_answer(question, lang, r["route"], r["level"], passages)
            else:
                out = await agents.repair_answer(question, lang, r["route"], r["level"], passages, prev or {}, v.codes, v.unsupported)
        except AiUnavailable as e:
            ctx.stage(mode, t, round=ctx.compose_rounds_used, status="unavailable")
            return _unavailable_from(r, e, "composer")
        finally:
            ctx.reserve_seconds = 0.0
        ctx.stage(mode, t, round=ctx.compose_rounds_used, status="ok", sufficient=out["sufficient"])
        track.cited = cited_ids(out)
        if mode == "repair" and _same_output(out, prev):
            # Never re-check an unchanged text until the checker happens to accept it.
            v = VerificationResult("rejected", [*v.codes, "repair_unchanged"])
            ctx.stage("verify", t, round=ctx.compose_rounds_used, status="rejected", codes=v.codes)
            return _verification_failed(r, v)
        t = time.monotonic()
        v = await verify(out, lang, retrieved)
        ctx.stage("verify", t, round=ctx.compose_rounds_used, status=v.status, codes=v.codes or None)
        if v.passed:
            break
        if v.status == "unavailable":
            return _unavailable_from(r, v.error, "verifier")
        log.info("answer rejected: %s", ",".join(v.codes))
        can_compose_again = ctx.compose_rounds_used < ctx.max_compose_rounds
        if v.insufficient_only:
            # §14.1 rule 6: the remaining retrieval round, then compose and verify again.
            if can_compose_again:
                ret2 = await _expand(session, ctx, track, q, lang, set(retrieved), first_empty=False)
                if ret2 is not None and ret2.status != "complete":
                    status = ret2.status
                new = [p for p in (ret2.passages if ret2 else []) if p["id"] not in retrieved]
                if new:
                    passages = _merge(passages, new, get_settings().knw_search_k)
                    retrieved = {p["id"]: p for p in passages}
                    mode, prev = "compose", None
                    continue
            return _no_evidence(r, status, "insufficient_evidence", v.codes)
        # A content violation: repaired once (flag), else refused as such (rule 7).
        if st.ask_repair_enabled and can_compose_again:
            mode, prev = "repair", out
            continue
        return _verification_failed(r, v)

    # 9. Source cards: every cited passage must still exist and be allowed (rule 8).
    ids = cited_ids(out)
    allowed = set((await source_policy.eligible_sources(session)).sources)
    cards = await source_cards(session, ids, allowed, live=track.live_cards)
    if len(cards) != len(ids):
        return _unavailable(r, "temporarily_unavailable", "source_missing_at_render")
    track.verified = True
    r.update(outcome="answered", answer=out["answer"], sources=cards)
    events: list[tuple[str, dict]] = []
    # Code, not the model, adds the referral and the "views differ" note (plan 4.6).
    if r["route"] == "personal":
        r["notes"].append(screen.fixed("personal_note", lang))
    if r["route"] == "disputed":
        r["notes"].append(screen.fixed("disputed_note", lang))
    if r["route"] in ESCALATE_ROUTES:
        r.update(should_escalate=True, handoff={"kind": "escalation", "lang": lang})
        events.append(("EscalationRequested", {"ask_id": r["ask_id"], "lang": lang, "route": r["route"], "reason": r["route"]}))

    # 10. KNW-10 R5: objective tagging with consent only. Optional work
    # (§14.4): if it fails, the verified answer is returned without it.
    if consent:
        t = time.monotonic()
        try:
            oid = await tasks.tag_question(session, question, lang, r["route"])
        except Exception:  # optional step: never turns a verified answer into a failure
            log.exception("objective tagging failed")
            await _rollback(session)
            oid = None
            ctx.stage("tag", t, status="failed")
        if oid:
            r["objective_id"] = oid
            events.append(("ObjectiveAsked", {"objective_id": oid}))
    return Result(r, events, [])


async def _rollback(session: AsyncSession) -> None:
    try:
        await session.rollback()
    except SQLAlchemyError:
        log.exception("rollback failed")


def _flags() -> dict[str, Any]:
    st = get_settings()
    return {
        "normalization": st.ask_query_normalization_enabled,
        "repair": st.ask_repair_enabled,
        "faq": st.ask_approved_faq_enabled,
        "min_similarity": st.knw_min_similarity,
        "k": st.knw_search_k,
        "near_tie": st.knw_near_tie_epsilon,
    }


async def answer(session: AsyncSession, question: str, lang: str, consent_objectives: bool = False) -> Result:
    st = get_settings()
    question = question.strip()
    r = _base(uuid.uuid4().hex, lang)
    live_mode = live_registry.live_on()
    # PRD live v3 §9: 60 s and 6 model calls per attempt in live mode.
    seconds = st.ask_live_deadline_seconds if live_mode else st.ask_deadline_seconds
    ctx = RequestContext.start(
        r["ask_id"],
        seconds=seconds,
        max_calls=st.ask_live_max_ai_calls if live_mode else st.ask_max_external_calls,
        max_retrieval_rounds=st.ask_max_retrieval_rounds,
        max_compose_rounds=st.ask_max_compose_rounds,
    )
    track = _Track()
    token = current.set(ctx)
    try:
        async with asyncio.timeout(seconds):
            res = await _pipeline(session, ctx, track, r, question, lang, consent_objectives)
    except TimeoutError:
        # The hard stop (e.g. a slow database): a clear failure, never "no source".
        await _rollback(session)
        ctx.stages.append({"stage": "deadline", "ms": int(seconds * 1000)})
        res = _unavailable(r, "deadline_exceeded", "pipeline_deadline")
    finally:
        current.reset(token)
    # PRD live v3 §10: optional, compatible additions. `live_search` lists
    # only what really happened in this attempt (empty when nothing was searched live).
    res.body["source_policy"] = live_registry.policy()
    res.body["used_source_ids"] = list(dict.fromkeys(c["source_id"] for c in res.body.get("sources") or []))
    if live_mode:
        res.body["live_search"] = [x.public() for x in track.live or []]
    res.trace = {
        "v": 1,
        "flags": _flags(),
        "calls": ctx.calls_used,
        "retrieval_rounds": ctx.retrieval_rounds_used,
        "compose_rounds": ctx.compose_rounds_used,
        "stages": ctx.stages,
        "sources": track.summary(),
    }
    if track.live is not None:
        res.trace["policy"] = live_registry.POLICY_LIVE
        res.trace["live"] = {x.source_id: x.trace() for x in track.live}
        res.trace["live_window_ms"] = track.live_window_ms
    return res


async def _write_log(
    body: dict[str, Any], started: float, *, detail: str | None, trace: dict | None, meta: AskIn, outcome: str | None = None
) -> None:
    """Diagnostic row in its own session: if it fails, the answer is still
    returned (§14.4). Codes, counts and durations only; never text."""
    try:
        async with SessionLocal() as s:
            s.add(
                AnswerLog(
                    lang=body["lang"],
                    route=body["route"] or "none",
                    level=body["level"],
                    outcome=outcome or body["outcome"],
                    latency_ms=int((time.monotonic() - started) * 1000),
                    ask_id=body["ask_id"],
                    reason_code=body.get("reason_code"),
                    detail=detail,
                    entrypoint=meta.entrypoint,
                    suggestion_id=meta.suggestion_id,
                    client_request_id=meta.client_request_id,
                    trace=trace,
                )
            )
            await s.commit()
    except Exception:  # diagnostics only: never fails the answer
        log.exception("answer log not written")


# A15: one attempt per client_request_id. A transport retry of the same
# request (same id, same client) gets the same result instead of a second
# search; a manual retry in the app sends a new id and starts a new attempt.
_attempts: dict[str, tuple[float, asyncio.Future]] = {}


@router.post("/ask")
async def ask(body: AskIn, session: Session, request: Request, user: OptionalUser) -> dict:
    key = tasks.client_key(request, user)
    now = time.monotonic()
    for k in [k for k, (until, _) in _attempts.items() if until < now]:
        _attempts.pop(k, None)
    dkey = f"{key}|{body.client_request_id}" if body.client_request_id else None
    if dkey and dkey in _attempts:
        return await asyncio.shield(_attempts[dkey][1])
    fut: asyncio.Future = asyncio.get_running_loop().create_future()
    if dkey:
        _attempts[dkey] = (now + DEDUP_SECONDS, fut)
    try:
        out = await _ask(body, session, request, user, key)
    except BaseException as e:
        if dkey:
            _attempts.pop(dkey, None)  # a failed attempt may be sent again
        if isinstance(e, Exception):
            fut.set_exception(e)
            fut.exception()  # retrieved: no "never retrieved" warning when nobody waits
        else:
            fut.cancel()
        raise
    fut.set_result(out)
    return out


async def _ask(body: AskIn, session: AsyncSession, request: Request, user: Any, key: str) -> dict:
    ratelimit.hit(f"ask:m:{key}", 8, 60)
    ratelimit.hit(f"ask:d:{key}", 120, 86400)
    started = time.monotonic()
    try:
        result = await answer(session, body.question, body.lang, body.consent_objectives)
    except Exception:
        # §14.1: an unexpected error is a technical error with a safe code, never "no source".
        log.exception("ask pipeline failed")
        await _rollback(session)
        failed = _base("-", body.lang)
        await _write_log(failed, started, detail="internal_error", trace=None, meta=body, outcome="error")
        raise HTTPException(500, "internal_error") from None
    b = result.body
    try:
        for name, payload in result.events:
            await publish(session, name, "KNW", payload)
        await session.commit()
    except SQLAlchemyError:
        # §14.4: a required effect (event) was not saved. Nothing was saved,
        # so a retry cannot duplicate it; never claim a human was reached.
        log.exception("answer effects not saved")
        await _rollback(session)
        await _write_log(b, started, detail="effects_failed", trace=result.trace, meta=body, outcome="error")
        raise HTTPException(503, "effects_failed") from None
    await _write_log(b, started, detail=result.detail, trace=result.trace, meta=body)
    return b
