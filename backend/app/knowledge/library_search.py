"""KNW-06 library live search (docs/domains/knowledge/features/PRD-LIBRARY-LIVE-SEARCH.md).

Content discovery, not an answer: titles, the source's own snippets, the
source's name, the type the source gives, and the original link. Nothing is
generated and nothing is labelled as reviewed by Rafeeq (B15).

- Own allowlist (§6, B21): `islamic_content` and `islamhouse` only. The chat's
  ASK_LIVE_SOURCES / ASK_SOURCE_POLICY are never read (B20).
- Connectors: the live-source package (`app.knowledge.live_sources`): the
  encyclopedia adapter `islamic_content` as it is, and the library-only
  IslamHouse site search `islamhouse`. Same SSRF-safe transport and budgets.
- Parallel, bounded (§8): every selected source starts at once inside one
  window (LIBRARY_SEARCH_WINDOW_SECONDS); a source still running when it
  ends is cancelled and reported `timeout`; one source's failure never
  touches another's results (B06).
- Merge (§7): each source keeps its own order; sources are fused by
  reciprocal rank (no provider scores compared), ties broken by a hash of the
  item id (stable, no site preference). Repeats are removed by record id and
  by normalised link across pages and sources (B22). A link is shown only on
  its own source's hosts, so one site's item is never labelled as another's.
- Pagination (§7): a short-lived in-memory session (5 minutes, this single
  backend process) holds the fetched-but-unshown items, each source's next
  page, and the ids already shown. The cursor is opaque, bound to the query,
  language, sources and type, and replaying it returns the same page (B09,
  B10, B11). A source with no more pages is never asked again.
- Privacy (§4, B14): POST only, `no-store`; the query is never logged or
  stored beyond the session that serves its pages; logs hold source, status,
  duration and counts only. httpx logs every request URL at INFO, and the
  encyclopedia's search is a GET with the words in its query string, so the
  httpx/httpcore loggers are raised to WARNING here (they only ever repeated
  URLs)."""

import asyncio
import hashlib
import hmac
import logging
import secrets
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

from app.core.config import get_settings
from app.knowledge import query_normalization
from app.knowledge.live_sources import evidence, http, islamhouse, islamic_content, registry
from app.knowledge.live_sources import types as T

log = logging.getLogger("rafeeq.library_search")
for _name in ("httpx", "httpcore"):  # B14: a request line would carry a GET search's words
    if logging.getLogger(_name).level < logging.WARNING:  # NOTSET included
        logging.getLogger(_name).setLevel(logging.WARNING)

LIBRARY_SOURCES = ("islamic_content", "islamhouse")  # §6: the only ids ever searched here
TYPES = ("book", "article", "audio", "video", "fatwa", "poster", "khutbah", "qa")
MAX_PAGES = 10  # bounded pagination: at most 10 result pages per search
MAX_SOURCE_PAGES = 15  # and at most 15 pages asked of one source
SOURCE_PAGES_PER_REQUEST = 2
RRF_K = 60
FAILED = ("timeout", "unavailable", "not_connected")


@dataclass(frozen=True)
class Source:
    id: str
    name: dict[str, str]
    hosts: frozenset[str]
    langs: frozenset[str]
    types: frozenset[str]  # library types this source labels reliably
    search: Callable[[registry.Call, str, str, str | None, int], Awaitable[islamhouse.Page]]
    blocked: Callable[[], str | None]

    def label(self, lang: str) -> str:
        return self.name.get(lang) or self.name["default"]


async def _encyclopedia(call: registry.Call, terms: str, lang: str, lib_type: str | None, page: int) -> islamhouse.Page:
    """The encyclopedia adapter as it is (one suggestion list, no pages)."""
    found = await islamic_content.search(call, terms, lang, islamhouse.PAGE_SIZE)
    for c in found:
        c.meta = {"type": "qa", "url": islamic_content.card_url(c.lang, str(c.meta.get("enc_id") or ""), c.external_id)}
    return islamhouse.Page(hits=found, has_more=False)


def sources() -> dict[str, Source]:
    enc = registry.connectors()["islamic_content"]
    return {
        "islamic_content": Source(
            "islamic_content",
            {"ar": "موسوعة المحتوى الإسلامي", "default": "Islamic Content Encyclopedia"},
            enc.hosts,
            enc.langs,
            frozenset({"qa"}),
            _encyclopedia,
            enc.blocked_reason,
        ),
        "islamhouse": Source(
            "islamhouse",
            {"ar": "إسلام هاوس", "default": "IslamHouse"},
            islamhouse.HOSTS,
            islamhouse.LANGS,
            frozenset(islamhouse.TYPES.values()),
            islamhouse.search_page,
            lambda: None,
        ),
    }


def switched_on() -> list[str]:
    """Library sources switched on in settings (a subset of the allowlist, never more)."""
    wanted = {s.strip() for s in get_settings().library_search_sources.split(",") if s.strip()}
    return [s for s in LIBRARY_SOURCES if s in wanted]


def availability(lang: str) -> list[dict[str, Any]]:
    """For the screen: which library sources can be searched now (§5)."""
    on = switched_on()
    out = []
    for sid, src in sources().items():
        connected = sid in on and src.blocked() is None
        out.append({"id": sid, "name": src.label(lang), "available": connected, "langs": sorted(src.langs), "types": sorted(src.types)})
    return out


# --- sessions ------------------------------------------------------------------


class SearchError(Exception):
    def __init__(self, status: int, code: str, extra: dict | None = None):
        super().__init__(code)
        self.status, self.code, self.extra = status, code, extra or {}


@dataclass
class _State:
    next_page: int | None = 1  # None: the source has no more pages
    buffer: list[T.Candidate] = field(default_factory=list)


@dataclass
class _Session:
    id: str
    fingerprint: str
    terms: str
    lang: str
    lib_type: str | None
    selected: tuple[str, ...]
    expires: float
    states: dict[str, _State]
    seen: set[str]  # record ids and normalised links already shown or waiting
    pages: dict[str, dict] = field(default_factory=dict)  # cursor -> the page it returned
    next_cursor: str | None = None
    served_pages: int = 0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_SESSIONS: "OrderedDict[str, _Session]" = OrderedDict()
_KEY = secrets.token_bytes(32)  # fingerprints never leave this process


def reset() -> None:
    _SESSIONS.clear()


def _prune(now: float) -> None:
    for sid in [k for k, s in _SESSIONS.items() if s.expires <= now]:
        _SESSIONS.pop(sid, None)
    cap = max(1, get_settings().library_search_max_sessions)
    while len(_SESSIONS) > cap:
        _SESSIONS.popitem(last=False)


def _fingerprint(terms: str, lang: str, selected: tuple[str, ...], lib_type: str | None) -> str:
    msg = "\x1f".join((terms, lang, ",".join(selected), lib_type or "")).encode()
    return hmac.new(_KEY, msg, hashlib.sha256).hexdigest()


def search_form(query: str) -> str:
    """§7: the search copy of the words (Unicode, spaces, diacritics), meaning
    unchanged, links/e-mails/long digit runs removed (live PRD's minimum)."""
    return evidence.search_terms(query_normalization.canonical(query))


def _norm_url(url: str) -> str:
    p = urlsplit(url)
    return f"{(p.hostname or '').lower()}{p.path.rstrip('/')}"


def _tie(item_id: str) -> str:
    return hashlib.sha256(item_id.encode()).hexdigest()


def _view(c: T.Candidate, src: Source, lang: str, now_iso: str) -> dict[str, Any]:
    return {
        "id": f"{c.source_id}:{c.lang}:{c.external_id}",
        "source_id": c.source_id,
        "source_name": src.label(lang),
        "title": c.title,
        "snippet": c.snippet or None,
        "type": c.meta.get("type"),
        "lang": c.lang,
        "url": c.meta["url"],
        "retrieved_at": now_iso,
    }


def _own_link(url: str, src: Source) -> bool:
    try:
        http.check_url(url, src.hosts)
    except http.FetchError:
        return False
    return True


def _status_of(code: str | None) -> str:
    return "timeout" if code in (T.TIMEOUT, T.WINDOW_CLOSED) else "unavailable"


async def _fetch(src: Source, st: _State, sess: _Session, client, shared: http.Budget, out: dict[str, Any], need: int) -> None:
    """One page from one source into its buffer; fills `out` even when cancelled."""
    s = get_settings()
    started = time.monotonic()
    budget = http.SourceBudget(shared, s.library_search_max_calls_per_source, hosts=src.hosts)
    call = registry.Call(client, budget, s.library_search_request_timeout_seconds)
    added = 0
    try:
        # At most SOURCE_PAGES_PER_REQUEST site pages, when the first one is
        # mostly repeats or non-materials and the source says it has more.
        for _ in range(SOURCE_PAGES_PER_REQUEST):
            page_no = st.next_page or 1
            page = await src.search(call, sess.terms, sess.lang, sess.lib_type, page_no)
            for c in page.hits:
                if c.source_id != src.id or not _own_link(str(c.meta.get("url") or ""), src):
                    continue  # B12/B22: only https links on the source's own hosts, under its own name
                keys = {f"id:{c.source_id}:{c.lang}:{c.external_id}", f"url:{_norm_url(c.meta['url'])}"}
                if keys & sess.seen:
                    continue  # already shown or waiting: once per search (B10, B22)
                if c.meta.get("type") not in src.types:
                    c.meta["type"] = None  # unknown kinds carry no badge (B13)
                if sess.lib_type and c.meta.get("type") != sess.lib_type:
                    continue
                st.buffer.append(c)
                sess.seen |= keys
                added += 1
            st.next_page = page_no + 1 if page.has_more and page_no < MAX_SOURCE_PAGES else None
            out["status"], out["items"] = ("ok" if added or st.buffer else "no_results"), added
            if len(st.buffer) >= need or st.next_page is None:
                break
    except asyncio.CancelledError:
        out["status"] = "ok" if added else "timeout"
        raise
    except http.FetchError as e:
        if not added:  # a later page failing never hides what the first one found
            out["status"] = _status_of(e.code)
    except Exception as e:  # one connector's bug never touches the others (B06)
        log.error("library search source=%s crashed: %s", src.id, type(e).__name__)
        out["status"] = "unavailable"
    finally:
        out["calls"] = budget.calls
        out["ms"] = int((time.monotonic() - started) * 1000)


async def _next_page(sess: _Session, page_size: int) -> dict[str, Any]:
    s = get_settings()
    srcs = sources()
    status: dict[str, dict[str, Any]] = {}
    tasks: list[asyncio.Task] = []
    shared = http.Budget(s.library_search_max_calls, time.monotonic() + s.library_search_window_seconds)
    client = http.new_client(s.ask_live_user_agent)
    try:
        for sid in sess.selected:
            src, st = srcs[sid], sess.states[sid]
            if len(st.buffer) >= page_size or st.next_page is None:
                status[sid] = {"status": "ok" if st.buffer or sess.served_pages else "no_results"}
                continue
            status[sid] = {"status": "timeout"}
            tasks.append(asyncio.create_task(_fetch(src, st, sess, client, shared, status[sid], page_size)))
        if tasks:
            _, pending = await asyncio.wait(tasks, timeout=max(0.0, shared.remaining()))
            for t in pending:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)  # nothing left running
    finally:
        await client.aclose()

    for sid, st in status.items():  # §8 logs: source, status, time, counts; never the query
        log.info(
            "library search source=%s status=%s ms=%s items=%s calls=%s",
            sid,
            st["status"],
            st.get("ms", 0),
            st.get("items", 0),
            st.get("calls", 0),
        )

    # Reciprocal-rank fusion over what each source holds, in its own order.
    pool = [(1.0 / (RRF_K + c.rank), sid, c) for sid in sess.selected for c in sess.states[sid].buffer]
    pool.sort(key=lambda x: (-x[0], _tie(f"{x[2].source_id}:{x[2].external_id}")))
    chosen = pool[:page_size]
    taken = {id(c) for _, _, c in chosen}
    for sid in sess.selected:
        sess.states[sid].buffer = [c for c in sess.states[sid].buffer if id(c) not in taken]

    now_iso = datetime.now(UTC).isoformat(timespec="seconds")
    items = [_view(c, srcs[sid], sess.lang, now_iso) for _, sid, c in chosen]
    sess.served_pages += 1

    failed = [sid for sid, st in status.items() if st["status"] in FAILED]
    if failed and len(failed) == len(sess.selected) and not items:
        raise SearchError(
            503, "sources_unavailable", {"source_status": [{"source_id": k, "status": v["status"]} for k, v in status.items()]}
        )
    more = sess.served_pages < MAX_PAGES and any(st.buffer or st.next_page is not None for st in sess.states.values())
    return {
        "items": items,
        "status": "partial" if failed else "success",
        "source_status": [{"source_id": k, "status": v["status"]} for k, v in status.items()],
        "more": more,
    }


async def search(
    *, query: str, lang: str, requested: list[str] | None, lib_type: str | None, page_size: int, cursor: str | None
) -> dict[str, Any]:
    s = get_settings()
    now = time.monotonic()
    _prune(now)
    terms = search_form(query)
    if len(terms) < 2:
        raise SearchError(422, "query_too_short")
    on = switched_on()
    srcs = sources()
    # §6: omitted = every library source that can be searched now; an explicit
    # list is searched as given (a blocked one is reported, never replaced).
    chosen = [sid for sid in LIBRARY_SOURCES if (sid in requested if requested is not None else sid in on and srcs[sid].blocked() is None)]
    unconnected = [sid for sid in chosen if sid not in on or srcs[sid].blocked() is not None]
    unsupported = {sid: "unsupported_language" for sid in chosen if lang not in srcs[sid].langs}
    unsupported |= {sid: "unsupported_type" for sid in chosen if lib_type and lib_type not in srcs[sid].types and sid not in unsupported}
    selected = tuple(sid for sid in chosen if sid not in unconnected and sid not in unsupported)
    extra = [{"source_id": sid, "status": "not_connected"} for sid in unconnected]
    extra += [{"source_id": sid, "status": st} for sid, st in unsupported.items() if sid not in unconnected]
    fp = _fingerprint(terms, lang, tuple(chosen), lib_type)

    if cursor is not None:
        sid_part = cursor.split(".", 1)[0]
        sess = _SESSIONS.get(sid_part)
        if sess is None or sess.expires <= now:
            raise SearchError(410, "search_expired")
        if not hmac.compare_digest(sess.fingerprint, fp):
            raise SearchError(422, "cursor_mismatch")
        async with sess.lock:
            if cursor in sess.pages:  # a repeated or late request: the same page, never a duplicate
                return sess.pages[cursor]
            if cursor != sess.next_cursor:
                raise SearchError(410, "search_expired")
            page = await _next_page(sess, page_size)
            body = _body(sess, page, extra)
            sess.pages[cursor] = body
            return body

    if not selected:
        if unconnected and len(unconnected) == len(chosen):
            raise SearchError(503, "sources_unavailable", {"source_status": extra})
        return {"search_id": None, "status": "success", "items": [], "source_status": extra, "next_cursor": None}

    sess = _Session(
        id=secrets.token_urlsafe(12),
        fingerprint=fp,
        terms=terms,
        lang=lang,
        lib_type=lib_type,
        selected=selected,
        expires=now + s.library_search_session_seconds,
        states={sid: _State() for sid in selected},
        seen=set(),
    )
    _SESSIONS[sess.id] = sess
    async with sess.lock:
        page = await _next_page(sess, page_size)
        return _body(sess, page, extra)


def _body(sess: _Session, page: dict[str, Any], extra: list[dict]) -> dict[str, Any]:
    sess.next_cursor = f"{sess.id}.{sess.served_pages + 1}.{secrets.token_urlsafe(6)}" if page["more"] else None
    status = "partial" if any(e["status"] == "not_connected" for e in extra) else page["status"]
    return {
        "search_id": sess.id,
        "status": status,
        "items": page["items"],
        "source_status": page["source_status"] + extra,
        "next_cursor": sess.next_cursor,
    }
