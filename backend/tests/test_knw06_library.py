"""KNW-06 library: one test per example.

Since 2026-10-06 (rules.md §1.4) items are reviewed before they are merged, so
a merged item is listed directly; an item the reviewer returns is withdrawn
until corrected."""

import httpx
import pytest

from app.core.db import SessionLocal
from app.knowledge import library
from tests.conftest import with_roles, withdraw


def _item(iid, lang="tl", topic="basics", type_="books", host="d1.islamhouse.com"):
    return {
        "id": f"ih-{iid}-{lang}",
        "external_id": str(iid),
        "type": type_,
        "topic": topic,
        "lang": lang,
        "title": f"Aklat {iid}",
        "authors": ["Muhammad Ash-Shahrīy"],
        "description": "",
        "origin_url": f"https://islamhouse.com/{lang}/{type_}/{iid}/",
        "files": [{"url": f"https://{host}/data/{lang}/{iid}.pdf", "ext": "pdf", "size": "1 MB"}],
    }


@pytest.fixture(autouse=True)
def _no_real_dns(monkeypatch):
    """The link check resolves each host before asking it (security review
    B-L13); tests never touch the network, so every name gets a public address."""
    from app.knowledge.live_sources import http as live_http
    from tests.knw_live_fakes import PUBLIC_IP

    async def resolve(host: str) -> list[str]:
        return [PUBLIC_IP]

    monkeypatch.setattr(live_http, "resolve_host", resolve)


UNITS = [
    {"id": "u1", "order": 1, "title": {"ar": "دليل اليوم الأول", "en": "First Day Guide", "tl": "Gabay sa Unang Araw"}},
    {"id": "u2", "order": 2, "title": {"ar": "ربي ونبيي وكتابي", "en": "My Lord", "tl": "Ang Panginoon ko"}},
    {"id": "u3", "order": 3, "title": {"ar": "أركان الإسلام", "en": "The Pillars of Islam", "tl": "Mga Haligi ng Islam"}},
]


@pytest.fixture
def items(monkeypatch):
    data = [_item(1), _item(2), _item(3, lang="en", topic="stories"), _item(4, lang="ar", topic="stories")]
    monkeypatch.setattr(library, "load", lambda: data)
    # KNW-06 R2: ih-1-tl belongs to unit u1; ih-2-tl and ih-3-en to u3; ih-4-ar to no unit.
    monkeypatch.setattr(library, "unit_links", lambda: {"ih-1-tl": "u1", "ih-2-tl": "u3", "ih-3-en": "u3"})
    monkeypatch.setattr(library, "path_units", lambda: UNITS)
    return data


def _ids(body):
    return [i["id"] for t in body["topics"] for i in t["items"]]


async def test_knw06_r1_merged_item_is_listed_without_approval(client, items):
    assert _ids((await client.get("/api/discover/library?lang=tl")).json()) == ["ih-1-tl", "ih-2-tl"]


async def test_knw06_r1_returned_item_withdrawn_until_corrected(client, items):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "library_item", "ih-1-tl", "tl", note="Hindi angkop ang paglalarawan")
    assert _ids((await client.get("/api/discover/library?lang=tl")).json()) == ["ih-2-tl"]
    assert _ids((await client.get("/api/discover/library?lang=en")).json()) == ["ih-3-en"]  # other languages unaffected
    items[0] = {**items[0], "description": "Itinamang paglalarawan"}  # the corrected entry is merged
    assert _ids((await client.get("/api/discover/library?lang=tl")).json()) == ["ih-1-tl", "ih-2-tl"]


async def test_knw06_r1_dead_link_is_hidden_after_check(client, items):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404 if "/2.pdf" in str(request.url) else 200)

    async with SessionLocal() as s, httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        counts = await library.check_library_links(s, http)
    assert counts == {"ok": 3, "hidden": 1}
    assert _ids((await client.get("/api/discover/library?lang=tl")).json()) == ["ih-1-tl"]

    # Back online → shown again.
    async with SessionLocal() as s, httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200))) as http:
        await library.check_library_links(s, http)
    assert _ids((await client.get("/api/discover/library?lang=tl")).json()) == ["ih-1-tl", "ih-2-tl"]


async def test_knw06_r1_unplayable_item_stays_hidden_even_when_its_link_answers(client, items, monkeypatch):
    monkeypatch.setattr(library, "unplayable_ids", lambda: frozenset({"ih-2-tl"}))
    async with SessionLocal() as s, httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200))) as http:
        await library.check_library_links(s, http)
    assert _ids((await client.get("/api/discover/library?lang=tl")).json()) == ["ih-1-tl"]


def test_knw06_r1_english_prayer_video_is_listed_unplayable():
    library.unplayable_ids.cache_clear()
    ids = library.unplayable_ids()
    assert "ih-2838921-en" in ids
    assert ids <= {it["id"] for it in library.load()}  # only real library items


async def test_knw06_r2_items_in_learner_language_only(client, items):
    body = (await client.get("/api/discover/library?lang=tl")).json()
    assert {i["lang"] for t in body["topics"] for i in t["items"]} == {"tl"}


async def test_knw06_r2_items_grouped_under_path_units_in_unit_order(client, items):
    body = (await client.get("/api/discover/library?lang=tl")).json()
    # Only units that have library items, in path order, then «عام»; u2 has none.
    assert [t["id"] for t in body["topics"]] == ["u1", "u3", "general"]
    by = {t["id"]: t for t in body["topics"]}
    assert [i["id"] for i in by["u1"]["items"]] == ["ih-1-tl"]
    assert [i["id"] for i in by["u3"]["items"]] == ["ih-2-tl"]
    assert by["u1"]["title"] == "Gabay sa Unang Araw" and by["u1"]["unit"] == "u1"


async def test_knw06_r2_item_without_a_unit_is_under_general(client, items):
    body = (await client.get("/api/discover/library?lang=ar")).json()
    general = next(t for t in body["topics"] if t["id"] == "general")
    assert [i["id"] for i in general["items"]] == ["ih-4-ar"] and general["unit"] is None


async def test_knw06_r2_empty_topic_and_english_on_request(client, items):
    ar = (await client.get("/api/discover/library?lang=ar")).json()
    en = (await client.get("/api/discover/library?lang=en")).json()  # the "show English items" choice
    assert [t["id"] for t in ar["topics"]] == [t["id"] for t in en["topics"]]  # same topics in every language
    assert next(t for t in ar["topics"] if t["id"] == "u3")["items"] == []
    assert [i["id"] for i in next(t for t in en["topics"] if t["id"] == "u3")["items"]] == ["ih-3-en"]


def test_knw06_r2_unit_links_only_name_real_units_and_real_items():
    library.unit_links.cache_clear()
    library.path_units.cache_clear()
    library.load.cache_clear()
    units = {u["id"] for u in library.path_units()}
    items = {it["id"] for it in library.load()}
    links = library.unit_links()
    assert links and set(links.values()) <= units
    assert set(links) <= items


async def test_knw06_r3_item_carries_source_card_fields(client, items):
    [it] = [i for t in (await client.get("/api/discover/library?lang=tl")).json()["topics"] for i in t["items"] if i["id"] == "ih-1-tl"]
    assert it["title"] == "Aklat 1" and it["authors"] == ["Muhammad Ash-Shahrīy"]
    assert it["source"] == "IslamHouse.com" and it["lang"] == "tl" and it["type"] == "books"
    assert it["origin_url"] == "https://islamhouse.com/tl/books/1/"
    assert it["files"][0]["url"].startswith("https://d1.islamhouse.com/")
    assert "image" not in it and "thumbnail" not in it  # R4: no unreviewed thumbnails


def test_knw06_r5_non_islamhouse_files_are_dropped():
    raw = {
        "id": 9,
        "type": "videos",
        "title": "Video",
        "source_language": "en",
        "prepared_by": [],
        "attachments": [{"url": "https://www.youtube.com/watch?v=x", "extension_type": "MP4", "size": ""}],
    }
    assert library.to_candidate(raw, "basics", "en") is None
    raw["attachments"].append({"url": "https://d1.islamhouse.com/data/en/v.mp4", "extension_type": "MP4", "size": "5 MB"})
    assert [f["url"] for f in library.to_candidate(raw, "basics", "en")["files"]] == ["https://d1.islamhouse.com/data/en/v.mp4"]
