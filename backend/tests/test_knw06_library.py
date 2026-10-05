"""KNW-06 library: one test per example."""

import httpx
import pytest

from app.core.db import SessionLocal
from app.knowledge import library
from tests.test_knw07_daily import approve, with_roles


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


@pytest.fixture
def items(monkeypatch):
    data = [_item(1), _item(2), _item(3, lang="en", topic="stories"), _item(4, lang="ar", topic="stories")]
    monkeypatch.setattr(library, "load", lambda: data)
    return data


def _ids(body):
    return [i["id"] for t in body["topics"] for i in t["items"]]


async def test_knw06_r1_approved_item_is_listed(client, items):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await approve(client, reviewer, "library_item", "ih-1-tl", "tl")
    assert _ids((await client.get("/api/discover/library?lang=tl")).json()) == ["ih-1-tl"]


async def test_knw06_r1_unapproved_item_is_hidden(client, items):
    assert _ids((await client.get("/api/discover/library?lang=tl")).json()) == []


async def test_knw06_r1_dead_link_is_hidden_after_check(client, items):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await approve(client, reviewer, "library_item", "ih-1-tl", "tl")
    await approve(client, reviewer, "library_item", "ih-2-tl", "tl")

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


async def test_knw06_r2_items_in_learner_language_only(client, items):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await approve(client, reviewer, "library_item", "ih-1-tl", "tl")
    await approve(client, reviewer, "library_item", "ih-3-en", "en")
    body = (await client.get("/api/discover/library?lang=tl")).json()
    basics = next(t for t in body["topics"] if t["id"] == "basics")
    assert [i["lang"] for i in basics["items"]] == ["tl"]


async def test_knw06_r2_empty_topic_and_english_on_request(client, items):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await approve(client, reviewer, "library_item", "ih-3-en", "en")
    tl = (await client.get("/api/discover/library?lang=tl")).json()
    assert next(t for t in tl["topics"] if t["id"] == "stories")["items"] == []
    en = (await client.get("/api/discover/library?lang=en")).json()  # the "show English items" choice
    assert _ids(en) == ["ih-3-en"]


async def test_knw06_r3_item_carries_source_card_fields(client, items):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await approve(client, reviewer, "library_item", "ih-1-tl", "tl")
    [it] = [i for t in (await client.get("/api/discover/library?lang=tl")).json()["topics"] for i in t["items"]]
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
