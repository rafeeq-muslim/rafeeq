"""PRD-LIBRARY-LIVE-SEARCH acceptance tests B01–B22 (backend side), with mocked
sites in the response shapes recorded from the real endpoints on 2026-10-06
(docs/engineering/implementation/KNW-06-library-live-search-report.md §2).
Dummy titles only. The app-side parts of B01, B02, B08, B09, B12, B14, B16
and B17 are in frontend/src/app/discover/libraryLiveSearch.test.tsx; the opt-in
live check is tests/live_smoke/test_knw06_library_search_smoke.py."""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
import respx

from app.core.config import get_settings
from app.knowledge import library, library_search
from app.knowledge.live_sources import http as live_http
from app.knowledge.live_sources import registry
from tests.conftest import with_roles, withdraw

PUBLIC_IP = "93.184.216.34"
URL = "/api/discover/library/search"
Q = "فضل الوضوء"


def ih_item(i: int, lang: str = "ar", kind: str = "books", title: str | None = None, nabza: str = "") -> dict:
    t = title if title is not None else f"TEST_TITLE {i}"
    return {
        "id": str(i),
        "lang": lang,
        "type": kind,
        "title": f'<a href="https://islamhouse.com/{i}" target="_blank">{t}</a>',
        "nabza": nabza,
    }


@dataclass
class Sites:
    """`ih[lang]` = the IslamHouse result list (served 20 per page, like the site);
    `ic[lang]` = encyclopedia suggestions. A value in `fail` (status, "timeout",
    "hang") makes that site's search fail."""

    ih: dict[str, list[dict]] = field(default_factory=dict)
    ic: dict[str, list[dict]] = field(default_factory=dict)
    fail: dict[str, object] = field(default_factory=dict)
    calls: list[tuple[str, httpx.Request]] = field(default_factory=list)

    def count(self, source: str) -> int:
        return sum(1 for s, _ in self.calls if s == source)

    async def _fail(self, source: str) -> httpx.Response | None:
        how = self.fail.get(source)
        if how is None:
            return None
        if how == "timeout":
            raise httpx.ReadTimeout("scripted timeout")
        if how == "hang":
            await asyncio.sleep(30)
        return httpx.Response(int(how), text="scripted failure")

    async def ih_search(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(("islamhouse", request))
        if r := await self._fail("islamhouse"):
            return r
        body = json.loads(request.content)
        lang, page, types = body["langs"][0], body["page"], body["types"]
        rows = [x for x in self.ih.get(lang, []) if types == ["-1"] or x["type"] in types]
        chunk = rows[(page - 1) * 20 : page * 20]
        if not chunk:
            return httpx.Response(404, text="<div>عفوا لم يتم العثور على نتائج للبحث</div>")
        return httpx.Response(200, json={"numFound": len(rows), "page": page, "showMore": page * 20 < len(rows), "items": chunk})

    async def ic_search(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(("islamic_content", request))
        if r := await self._fail("islamic_content"):
            return r
        lang = parse_qs(urlsplit(str(request.url)).query)["lang"][0]
        return httpx.Response(200, json=[{"type": "aya", "title": "TEST", "metadata": {}}, *self.ic.get(lang, [])])


def ic_card(card: str, title: str = "TEST_CARD") -> dict:
    return {"type": "card", "title": title, "text": title, "metadata": {"external_id": card, "enc_id": "102"}}


@pytest.fixture
def sites(monkeypatch):
    st = get_settings()
    monkeypatch.setattr(st, "library_search_enabled", True)
    monkeypatch.setattr(st, "library_search_sources", "islamic_content,islamhouse")
    monkeypatch.setattr(st, "ask_live_islamic_content_search_permitted", True)
    resolved: dict[str, list[str]] = {}

    async def fake_resolve(host: str) -> list[str]:
        return resolved.get(host, [PUBLIC_IP])

    monkeypatch.setattr(live_http, "resolve_host", fake_resolve)
    library_search.reset()
    s = Sites()
    s.resolved = resolved  # type: ignore[attr-defined]
    with respx.mock(assert_all_called=False, assert_all_mocked=True) as mock:
        mock.post("https://islamhouse.com/search/search.php").mock(side_effect=s.ih_search)
        mock.get(url__regex=r"^https://islamenc\.com/api/search/suggestions\?").mock(side_effect=s.ic_search)
        yield s
    library_search.reset()


async def search(client, status=200, **body) -> dict:
    r = await client.post(URL, json={"query": Q, "lang": "ar", **body})
    assert r.status_code == status, r.text
    assert r.headers["cache-control"] == "no-store"
    return r.json()


def st(b: dict) -> dict[str, str]:
    return {x["source_id"]: x["status"] for x in b["source_status"]}


# --- B01 / B19: the reviewed catalogue is untouched ------------------------------------


def _cat(iid, lang="ar"):
    return {
        "id": f"ih-{iid}-{lang}",
        "external_id": str(iid),
        "type": "books",
        "topic": "basics",
        "lang": lang,
        "title": f"TEST_BOOK {iid}",
        "authors": [],
        "description": "",
        "origin_url": f"https://islamhouse.com/{lang}/books/{iid}/",
        "files": [{"url": f"https://d1.islamhouse.com/data/{lang}/{iid}.pdf", "ext": "pdf", "size": "1 MB"}],
    }


async def test_knw06_search_b01_catalogue_unchanged_before_and_after_search(client, sites, monkeypatch):
    monkeypatch.setattr(library, "load", lambda: [_cat(1), _cat(2)])
    before = await client.get("/api/discover/library?lang=ar")
    sites.ih["ar"] = [ih_item(9001)]
    await search(client)
    after = await client.get("/api/discover/library?lang=ar")
    assert before.json() == after.json() and before.headers["cache-control"] == "public, max-age=300"
    ids = [i["id"] for t in after.json()["topics"] for i in t["items"]]
    assert ids == ["ih-1-ar", "ih-2-ar"]  # a search result never joins the reviewed list


async def test_knw06_search_b19_withdrawn_and_dead_items_stay_hidden(client, sites, monkeypatch):
    monkeypatch.setattr(library, "load", lambda: [_cat(1), _cat(2), _cat(3)])
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "library_item", "ih-1-ar", "ar")
    from app.core.db import SessionLocal

    async with (
        SessionLocal() as s,
        httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(404 if "/2.pdf" in str(r.url) else 200))) as h,
    ):
        await library.check_library_links(s, h)
    sites.ih["ar"] = [ih_item(1), ih_item(2)]  # the same records exist at the source
    b = await search(client)
    assert {i["id"] for i in b["items"]} == {"islamhouse:ar:1", "islamhouse:ar:2"}  # shown as source material only
    ids = [i["id"] for t in (await client.get("/api/discover/library?lang=ar")).json()["topics"] for i in t["items"]]
    assert ids == ["ih-3-ar"]


# --- B03–B07: which sources run, partial failure, honest empties ---------------------


async def test_knw06_search_b03_all_searches_both_sources_from_backend(client, sites):
    sites.ih["ar"] = [ih_item(1)]
    sites.ic["ar"] = [ic_card("26011")]
    b = await search(client)
    assert sites.count("islamhouse") == 1 and sites.count("islamic_content") == 1
    assert st(b) == {"islamic_content": "ok", "islamhouse": "ok"} and b["status"] == "success"
    assert {i["source_id"] for i in b["items"]} == {"islamhouse", "islamic_content"}
    enc = next(i for i in b["items"] if i["source_id"] == "islamic_content")
    assert enc["url"] == "https://islamenc.com/ar/enc/102/card/26011" and enc["type"] == "qa"
    assert enc["source_name"] == "موسوعة المحتوى الإسلامي"


async def test_knw06_search_b04_one_source_only_no_hidden_fallback(client, sites):
    sites.ic["ar"] = [ic_card("26011")]
    b = await search(client, sources=["islamhouse"])  # islamhouse has nothing for this query
    assert b["items"] == [] and st(b) == {"islamhouse": "no_results"} and b["status"] == "success"
    assert sites.count("islamic_content") == 0


async def test_knw06_search_b05_results_from_one_site_are_normal(client, sites):
    sites.ih["ar"] = [ih_item(1), ih_item(2)]
    b = await search(client)
    assert b["status"] == "success" and len(b["items"]) == 2
    assert st(b) == {"islamic_content": "no_results", "islamhouse": "ok"}


async def test_knw06_search_b06_one_connector_down_others_shown_partial(client, sites):
    sites.ih["ar"] = [ih_item(1)]
    sites.fail["islamic_content"] = 500
    b = await search(client)
    assert b["status"] == "partial" and [i["id"] for i in b["items"]] == ["islamhouse:ar:1"]
    assert st(b) == {"islamic_content": "unavailable", "islamhouse": "ok"}


async def test_knw06_search_b07_no_results_differs_from_all_failed(client, sites):
    empty = await search(client)
    assert empty["status"] == "success" and empty["items"] == []
    assert set(st(empty).values()) == {"no_results"}
    sites.fail["islamhouse"] = 503
    sites.fail["islamic_content"] = "timeout"
    r = await client.post(URL, json={"query": Q, "lang": "ar"})
    assert r.status_code == 503 and r.headers["cache-control"] == "no-store"
    d = r.json()["detail"]
    assert d["code"] == "sources_unavailable"
    assert {x["source_id"]: x["status"] for x in d["source_status"]} == {"islamhouse": "unavailable", "islamic_content": "timeout"}


async def test_knw06_search_b07_zero_results_with_one_source_down_is_partial(client, sites):
    sites.fail["islamic_content"] = 502
    b = await search(client)
    assert b["status"] == "partial" and b["items"] == []
    assert st(b) == {"islamic_content": "unavailable", "islamhouse": "no_results"}


# --- B09–B11: pagination and cursors --------------------------------------------------


async def test_knw06_search_b10_pages_without_repeats_and_an_end(client, sites):
    sites.ih["ar"] = [ih_item(i) for i in range(1, 46)]  # 3 site pages: 20 + 20 + 5
    sites.ic["ar"] = [ic_card(str(26000 + i)) for i in range(3)]  # one list, no pages
    seen: list[str] = []
    cursor = None
    pages = 0
    while True:
        b = await search(client, page_size=12, **({"cursor": cursor} if cursor else {}))
        seen += [i["id"] for i in b["items"]]
        pages += 1
        cursor = b["next_cursor"]
        if not cursor:
            break
        assert pages < 10
    assert len(seen) == len(set(seen)) == 48  # everything once, nothing twice
    assert sites.count("islamhouse") == 3  # each site page asked once
    assert sites.count("islamic_content") == 1  # no pages: never asked again, never page one again


async def test_knw06_search_b10_one_source_ends_the_other_continues(client, sites):
    sites.ih["ar"] = [ih_item(i) for i in range(1, 31)]
    sites.ic["ar"] = [ic_card("26001")]
    first = await search(client, page_size=20)
    second = await search(client, page_size=20, cursor=first["next_cursor"])
    assert {i["source_id"] for i in second["items"]} == {"islamhouse"}
    assert second["next_cursor"] is None
    assert len({i["id"] for i in first["items"] + second["items"]}) == 31


async def test_knw06_search_b10_a_page_of_non_materials_reads_the_next_site_page(client, sites):
    sites.ih["ar"] = [ih_item(i, kind="category") for i in range(1, 19)] + [ih_item(i) for i in range(19, 40)]
    b = await search(client, page_size=12)
    assert len(b["items"]) == 12 and sites.count("islamhouse") == 2  # two site pages, one request, bounded
    assert all(i["type"] == "book" for i in b["items"])


async def test_knw06_search_b09_repeated_cursor_returns_the_same_page(client, sites):
    sites.ih["ar"] = [ih_item(i) for i in range(1, 41)]
    first = await search(client, page_size=12)
    a, b = await asyncio.gather(
        client.post(URL, json={"query": Q, "lang": "ar", "page_size": 12, "cursor": first["next_cursor"]}),
        client.post(URL, json={"query": Q, "lang": "ar", "page_size": 12, "cursor": first["next_cursor"]}),
    )
    assert a.status_code == b.status_code == 200 and a.json() == b.json()  # double click: one page, no duplicates
    assert not {i["id"] for i in first["items"]} & {i["id"] for i in a.json()["items"]}


async def test_knw06_search_b11_expired_or_unknown_cursor_is_refused(client, sites, monkeypatch):
    sites.ih["ar"] = [ih_item(i) for i in range(1, 41)]
    r = await client.post(URL, json={"query": Q, "lang": "ar", "cursor": "unknown-session.2.abcd"})
    assert r.status_code == 410 and r.json()["detail"]["code"] == "search_expired"
    first = await search(client)
    monkeypatch.setattr(get_settings(), "library_search_session_seconds", 0)
    library_search._SESSIONS[first["search_id"]].expires = 0  # five minutes later
    r = await client.post(URL, json={"query": Q, "lang": "ar", "cursor": first["next_cursor"]})
    assert r.status_code == 410 and r.json()["detail"]["code"] == "search_expired"


async def test_knw06_search_b11_cursor_from_other_query_or_filters_is_refused(client, sites):
    sites.ih["ar"] = [ih_item(i) for i in range(1, 41)]
    first = await search(client)
    for other in ({"query": "صفة الصلاة"}, {"sources": ["islamhouse"]}, {"type": "book"}, {"lang": "en"}):
        r = await client.post(URL, json={"query": Q, "lang": "ar", "cursor": first["next_cursor"], **other})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "cursor_mismatch", other


# --- B12 / B13 / B15: safe text, real links, honest labels ----------------------------


async def test_knw06_search_b12_html_is_text_and_links_are_built_from_ids(client, sites):
    sites.ih["ar"] = [
        ih_item(
            1,
            title='<img src=x onerror="alert(1)"><mark>صفة</mark> <script>alert(2)</script>الوضوء',
            nabza="<b>نبذة</b> &amp; <i>مختصرة</i>",
        ),
        {"id": "javascript:alert(1)", "lang": "ar", "type": "books", "title": "TEST_BAD_ID", "nabza": ""},
        {"id": "7", "lang": "ar", "type": "../../evil", "title": "TEST_BAD_TYPE", "nabza": ""},
    ]
    b = await search(client)
    assert [i["id"] for i in b["items"]] == ["islamhouse:ar:1"]
    it = b["items"][0]
    assert "<" not in it["title"] and "<" not in it["snippet"]
    assert it["snippet"] == "نبذة & مختصرة"
    assert it["url"] == "https://islamhouse.com/ar/books/1"


async def test_knw06_search_b12_private_address_is_never_called(client, sites):
    sites.resolved["islamhouse.com"] = ["10.0.0.5"]  # DNS points inside
    sites.ic["ar"] = [ic_card("26011")]
    b = await search(client)
    assert sites.count("islamhouse") == 0
    assert st(b)["islamhouse"] == "unavailable" and b["status"] == "partial"


async def test_knw06_search_b13_other_language_and_unknown_types(client, sites):
    sites.ih["tl"] = [
        ih_item(1, lang="tl"),
        ih_item(2, lang="en"),
        ih_item(3, lang="tl", kind="category"),
        ih_item(4, lang="tl", kind="newkind"),
    ]
    b = await search(client, lang="tl", query="pagdarasal")
    assert [(i["id"], i["type"]) for i in b["items"]] == [("islamhouse:tl:1", "book"), ("islamhouse:tl:4", None)]


async def test_knw06_search_b13_type_filter_never_relabels(client, sites):
    sites.ih["ar"] = [ih_item(1, kind="books"), ih_item(2, kind="videos")]
    sites.ic["ar"] = [ic_card("26011")]
    books = await search(client, type="book")
    assert [i["id"] for i in books["items"]] == ["islamhouse:ar:1"]
    assert st(books) == {"islamhouse": "ok", "islamic_content": "unsupported_type"} and books["status"] == "success"
    assert sites.count("islamic_content") == 0
    qa = await search(client, type="qa")
    assert [i["source_id"] for i in qa["items"]] == ["islamic_content"]
    assert st(qa)["islamhouse"] == "unsupported_type"


async def test_knw06_search_b15_external_result_is_named_and_never_reviewed(client, sites):
    sites.ih["ar"] = [ih_item(1)]
    it = (await search(client))["items"][0]
    assert set(it) == {"id", "source_id", "source_name", "title", "snippet", "type", "lang", "url", "retrieved_at"}
    assert it["source_name"] == "إسلام هاوس" and it["url"].startswith("https://islamhouse.com/")
    en = await search(client, lang="en", query="wudu")  # names follow the screen language
    assert en["items"] == [] or en["items"][0]["source_name"] == "IslamHouse"


# --- B14: privacy ------------------------------------------------------------------


async def test_knw06_search_b14_query_never_logged_or_in_a_url(client, sites, caplog):
    secret = "TEST_SECRET_WORDS"
    sites.ih["en"] = [ih_item(1, lang="en")]
    caplog.set_level(logging.DEBUG)
    r = await client.post(URL, json={"query": secret, "lang": "en"})
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    assert secret not in caplog.text and "library search source=islamhouse status=ok" in caplog.text
    sent = [req for s, req in sites.calls if s == "islamhouse"][0]
    assert (
        secret not in str(sent.url)
        and "authorization" not in {k.lower() for k in sent.headers}
        and "cookie" not in {k.lower() for k in sent.headers}
    )
    assert json.loads(sent.content)["term"] == secret  # the words go to the source, nothing else about the person
    assert (await client.get(f"{URL}?query={secret}&lang=en")).status_code == 405  # no GET with the words in a URL


async def test_knw06_search_b14_session_holds_no_identity_and_ends(client, sites):
    sites.ih["ar"] = [ih_item(i) for i in range(1, 30)]
    b = await search(client)
    sess = library_search._SESSIONS[b["search_id"]]
    assert not hasattr(sess, "user") and not hasattr(sess, "ip")
    assert sess.expires - asyncio.get_running_loop().time() <= get_settings().library_search_session_seconds + 1


# --- B17: every request ends ---------------------------------------------------------


async def test_knw06_search_b17_invalid_input_is_422(client, sites):
    for body in (
        {"query": " a ", "lang": "ar"},
        {"query": "x" * 201, "lang": "ar"},
        {"query": Q, "lang": "fr"},
        {"query": Q, "lang": "ar", "page_size": 0},
        {"query": Q, "lang": "ar", "page_size": 21},
        {"query": Q, "lang": "ar", "type": "novel"},
        {"query": Q, "lang": "ar", "user_id": "x"},
        {"query": "!!", "lang": "ar"},  # nothing left to search after normalisation
    ):
        assert (await client.post(URL, json=body)).status_code == 422, body
    assert sites.calls == []


async def test_knw06_search_b17_rate_limit_is_429(client, sites):
    for _ in range(20):
        await search(client)
    r = await client.post(URL, json={"query": Q, "lang": "ar"})
    assert r.status_code == 429 and r.headers["cache-control"] == "no-store"


async def test_knw06_search_b17_slow_source_cancelled_inside_the_window(client, sites, monkeypatch):
    monkeypatch.setattr(get_settings(), "library_search_window_seconds", 1.0)
    sites.ih["ar"] = [ih_item(1)]
    sites.fail["islamic_content"] = "hang"
    t0 = asyncio.get_running_loop().time()
    b = await search(client)
    assert asyncio.get_running_loop().time() - t0 < 3
    assert b["status"] == "partial" and st(b) == {"islamic_content": "timeout", "islamhouse": "ok"}
    assert [i["id"] for i in b["items"]] == ["islamhouse:ar:1"]


async def test_knw06_search_b17_switched_off_is_404_and_catalogue_stays(client, sites, monkeypatch):
    monkeypatch.setattr(get_settings(), "library_search_enabled", False)
    r = await client.post(URL, json={"query": Q, "lang": "ar"})
    assert r.status_code == 404 and r.json()["detail"] == "library_search_off"
    assert (await client.get("/api/discover/library/search/sources")).json() == {"enabled": False, "sources": []}
    assert (await client.get("/api/discover/library?lang=ar")).status_code == 200


# --- B18: a connector that is not usable from the backend ------------------------------


async def test_knw06_search_b18_encyclopedia_not_connected_is_never_called(client, sites, monkeypatch):
    monkeypatch.setattr(get_settings(), "ask_live_islamic_content_search_permitted", False)  # robots.txt: no written access yet
    sites.ih["ar"] = [ih_item(1)]
    sites.ic["ar"] = [ic_card("26011")]
    av = (await client.get("/api/discover/library/search/sources?lang=ar")).json()
    assert {s["id"]: s["available"] for s in av["sources"]} == {"islamic_content": False, "islamhouse": True}
    b = await search(client)  # "all" = what can be searched now
    assert st(b) == {"islamhouse": "ok"} and b["status"] == "success"
    asked = await search(client, sources=["islamic_content", "islamhouse"])  # asked by name: reported, not replaced
    assert st(asked) == {"islamhouse": "ok", "islamic_content": "not_connected"} and asked["status"] == "partial"
    r = await client.post(URL, json={"query": Q, "lang": "ar", "sources": ["islamic_content"]})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "sources_unavailable"
    assert sites.count("islamic_content") == 0


# --- B20 / B21: separate from the chat; the library allowlist --------------------------


async def test_knw06_search_b20_chat_sources_untouched(client, sites, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "ask_source_policy", registry.POLICY_LIVE)
    monkeypatch.setattr(s, "ask_live_sources", "islamqa,binbaz")
    sites.ih["ar"] = [ih_item(1)]
    b = await search(client)
    assert {x["source_id"] for x in b["source_status"]} <= {"islamhouse", "islamic_content"}
    assert "islamhouse" not in registry.connectors()  # the chat's connector list is unchanged
    assert [c.id for c in registry.enabled()] == ["islamqa", "binbaz"]
    assert s.ask_live_sources == "islamqa,binbaz"


async def test_knw06_search_b21_other_sources_are_refused(client, sites):
    for sources in (["islamqa"], ["binbaz"], ["islamhouse", "islamqa"], ["islamhouse_enc"], [], ["IslamHouse"]):
        r = await client.post(URL, json={"query": Q, "lang": "ar", "sources": sources})
        assert r.status_code == 422, sources
    assert sites.calls == []


async def test_knw06_search_b21_settings_cannot_widen_the_allowlist(client, sites, monkeypatch):
    monkeypatch.setattr(get_settings(), "library_search_sources", "islamhouse,islamqa,binbaz")
    sites.ih["ar"] = [ih_item(1)]
    b = await search(client)
    assert set(st(b)) == {"islamhouse"}
    assert {x["id"] for x in (await client.get("/api/discover/library/search/sources")).json()["sources"]} == {
        "islamhouse",
        "islamic_content",
    }


# --- B22: two sources, overlapping data -----------------------------------------------


async def test_knw06_search_b22_overlapping_records_shown_once_under_their_own_site(client, sites, monkeypatch):
    # The site repeats item 1 on its second page (its index shifted), and the
    # encyclopedia returns a record whose link is an IslamHouse page.
    sites.ih["ar"] = [ih_item(i) for i in range(1, 21)] + [ih_item(1), ih_item(21)]
    sites.ic["ar"] = [ic_card("26011")]
    real = library_search.sources

    def overlapping():
        src = real()
        orig = src["islamic_content"].search

        async def points_at_islamhouse(call, terms, lang, lib_type, page):
            p = await orig(call, terms, lang, lib_type, page)
            p.hits[0].meta["url"] = "https://islamhouse.com/ar/books/1/"
            return p

        from dataclasses import replace

        return {**src, "islamic_content": replace(src["islamic_content"], search=points_at_islamhouse)}

    monkeypatch.setattr(library_search, "sources", overlapping)
    first = await search(client, page_size=20)
    second = await search(client, page_size=20, cursor=first["next_cursor"])
    items = first["items"] + second["items"]
    assert [i["url"] for i in items].count("https://islamhouse.com/ar/books/1") == 1
    assert len(items) == len({i["id"] for i in items}) == 21
    assert all(i["source_id"] == "islamhouse" for i in items)  # never shown as the encyclopedia's item


async def test_knw06_search_b22_filters_keep_identity_and_one_proves_nothing_for_the_other(client, sites, monkeypatch):
    sites.ih["ar"] = [ih_item(1)]
    sites.ic["ar"] = [ic_card("26011")]
    only_enc = await search(client, sources=["islamic_content"])
    assert {i["source_id"] for i in only_enc["items"]} == {"islamic_content"} and sites.count("islamhouse") == 0
    only_ih = await search(client, sources=["islamhouse"])
    assert {i["source_id"] for i in only_ih["items"]} == {"islamhouse"}
    monkeypatch.setattr(get_settings(), "ask_live_islamic_content_search_permitted", False)
    av = {s["id"]: s["available"] for s in library_search.availability("ar")}
    assert av == {"islamic_content": False, "islamhouse": True}  # IslamHouse working does not make the encyclopedia "connected"
