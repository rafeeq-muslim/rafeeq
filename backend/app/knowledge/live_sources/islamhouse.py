"""IslamHouse.com site search, read live for the library (PRD-LIBRARY-LIVE-SEARCH §5).

Library use only: this module is NOT a chat connector and is not listed in
`registry.CONNECTORS`, so the assistant's source list does not change (B20).

Identity: islamhouse.com («دار الإسلام», ICSA), the same publisher as the
API v3 used for the reviewed catalogue (`app.knowledge.library`). It is not
`islamhouse_enc` (enc.islamhouse.com, one book) and not the Islamic Content
Encyclopedia (islamenc.com).

Endpoint (checked from this backend on 2026-10-06, see the KNW-06 library
search report §2): the site's own search page (islamhouse.com/search/private.html,
script /search/js/app.*.js) posts JSON to

  POST https://islamhouse.com/search/search.php
       {"browse_mode": false, "term", "langs": [lang], "types": [type | "-1"], "page", "flang"}
  200 -> {"numFound", "from", "to", "page", "showMore", "f_types", "items":
          [{"id", "lang", "type", "title" (HTML link), "nabza" (HTML snippet)}]}   20 per page
  404 -> an HTML "no results" message

API v3 (Postman 7929737/TzkyMfPc) and the ICSA SDK/MCP server have no search
operation; this endpoint is undocumented ⚠️ (robots.txt allows every path).
Written confirmation from IslamHouse is still to be asked (report §8).

The request carries the search words only: no identity, no cookies kept
(one client per request), an honest User-Agent."""

import json
import re
from dataclasses import dataclass, field

import httpx

from app.knowledge.live_sources import http
from app.knowledge.live_sources import types as T
from app.knowledge.live_sources.registry import Call
from app.knowledge.sources._common import strip_html

SEARCH = "https://islamhouse.com/search/search.php"
HOSTS = frozenset({"islamhouse.com"})
LANGS = frozenset({"ar", "en", "tl"})
PAGE_SIZE = 20  # fixed by the site
SNIPPET_CHARS = 280

# IslamHouse type key -> library type. Only kinds the site itself labels;
# nothing is reclassified (PRD §3: no item is called a book by guess).
TYPES = {
    "books": "book",
    "articles": "article",
    "audios": "audio",
    "videos": "video",
    "fatwa": "fatwa",
    "poster": "poster",
    "khotab": "khutbah",
}
# Not a material to open: a list page, an app store link, a reading list, a publisher or author page.
SKIP = frozenset({"category", "apps", "favorites", "source", "author"})
TYPE_KEY = {v: k for k, v in TYPES.items()}

_ID = re.compile(r"^\d{1,10}$")
_KEY = re.compile(r"^[a-z]{2,20}$")


@dataclass
class Page:
    hits: list[T.Candidate] = field(default_factory=list)
    has_more: bool = False


async def _post_once(call: Call, body: dict, timeout_cap: float) -> httpx.Response | None:
    u = http.check_url(SEARCH, call.budget.hosts)
    try:
        ips = await http.resolve_host(u.host)
    except OSError:
        raise http.FetchError(T.TRANSPORT_ERROR) from None
    if not ips or not all(http.ip_is_public(ip) for ip in ips):
        raise http.FetchError(T.BLOCKED_URL)
    timeout = min(timeout_cap, call.budget.take())
    try:
        async with call.client.stream(
            "POST", u, json=body, headers={"Accept": "application/json", "Content-Type": "application/json"}, timeout=timeout
        ) as r:
            if r.status_code == 404:
                return None  # the site's "no results" answer
            if r.status_code in http.RETRY_STATUSES:
                raise http.FetchError(T.RATE_LIMITED if r.status_code == 429 else T.HTTP_ERROR, transient=True)
            if r.status_code != 200:  # a redirect included: never followed for a POST
                raise http.FetchError(T.HTTP_ERROR)
            buf = bytearray()
            async for chunk in r.aiter_bytes():
                buf.extend(chunk)
                if len(buf) > http.MAX_BYTES:
                    raise http.FetchError(T.BAD_RESPONSE)
            return httpx.Response(200, content=bytes(buf))
    except httpx.TimeoutException:
        raise http.FetchError(T.TIMEOUT) from None
    except httpx.HTTPError:
        raise http.FetchError(T.TRANSPORT_ERROR) from None


async def _post(call: Call, body: dict) -> httpx.Response | None:
    """POST with the same checks as http.get (allowed host, public addresses,
    budget, size cap) and one transient retry inside the window."""
    try:
        return await _post_once(call, body, call.timeout_s)
    except http.FetchError as e:
        if not e.transient:
            raise
        return await _post_once(call, body, call.timeout_s)


def item_url(lang: str, ih_type: str, ext_id: str) -> str:
    """The item's own page (what islamhouse.com/{id} redirects to)."""
    return f"https://islamhouse.com/{lang}/{ih_type}/{ext_id}"


def parse(data: object, lang: str, page: int) -> Page:
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise http.FetchError(T.BAD_RESPONSE)
    out = Page(has_more=bool(data.get("showMore")))
    for i, it in enumerate(data["items"]):
        if not isinstance(it, dict):
            continue
        ext, kind, item_lang = str(it.get("id") or ""), str(it.get("type") or ""), str(it.get("lang") or "")
        if not _ID.match(ext) or not _KEY.match(kind) or kind in SKIP:
            continue
        if item_lang != lang:
            continue  # B13: never shown as the asked language
        title = strip_html(str(it.get("title") or "")).strip()
        if not title:
            continue
        snippet = " ".join(strip_html(str(it.get("nabza") or "")).split())
        if len(snippet) > SNIPPET_CHARS:
            snippet = snippet[: SNIPPET_CHARS - 1].rstrip() + "…"
        out.hits.append(
            T.Candidate(
                source_id="islamhouse",
                external_id=ext,
                lang=lang,
                title=title,
                rank=(page - 1) * PAGE_SIZE + i + 1,
                snippet=snippet,
                meta={"type": TYPES.get(kind), "url": item_url(lang, kind, ext)},
            )
        )
    return out


async def search_page(call: Call, terms: str, lang: str, lib_type: str | None, page: int) -> Page:
    """One page of the site's own search, in one language (and one type)."""
    body = {
        "browse_mode": False,
        "term": terms,
        "langs": [lang],
        "types": [TYPE_KEY[lib_type]] if lib_type else ["-1"],
        "page": page,
        "flang": lang,
    }
    r = await _post(call, body)
    if r is None:
        return Page()
    try:
        data = json.loads(r.content.decode("utf-8", errors="replace"))
    except ValueError:
        raise http.FetchError(T.BAD_RESPONSE) from None
    return parse(data, lang, page)
