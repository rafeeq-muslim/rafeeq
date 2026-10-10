"""PLT-12 download center: the catalogue and the pass-through, one test per example
where the server takes part (the device side is in frontend/src/app/downloads)."""

import json
import logging

import httpx
import pytest

from app.knowledge import library, recitation
from app.platform import downloads
from tests.conftest import with_roles, withdraw
from tests.knw_fakes import add_passages

MB = 1024 * 1024
MULK = "https://d1.islamhouse.com/data/ar/ih_quran/maher/ar-067-maher.mp3"
BAQARA = "https://d1.islamhouse.com/data/ar/ih_quran/maher/ar-002-maher.mp3"
FATIHA = "https://d1.islamhouse.com/data/ar/ih_quran/maher/ar-001-maher.mp3"


class Upstream:
    """IslamHouse / QuranEnc stand-in: records every request; sizes by URL."""

    def __init__(self, sizes: dict[str, int] | None = None, redirect: bool = False):
        self.sizes = sizes or {}
        self.redirect = redirect
        self.seen: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.seen.append(request)
        url = str(request.url)
        if self.redirect:
            return httpx.Response(302, headers={"Location": "http://127.0.0.1:5442/secret"})
        size = self.sizes.get(url, 1000)
        if request.method == "HEAD":
            return httpx.Response(200, headers={"Content-Length": str(size)})
        rng = request.headers.get("range")
        if rng:
            start, _, end = rng.removeprefix("bytes=").partition("-")
            a, b = int(start), int(end or size - 1)
            return httpx.Response(
                206, headers={"Content-Range": f"bytes {a}-{b}/{size}", "Content-Length": str(b - a + 1)}, content=b"x" * (b - a + 1)
            )
        return httpx.Response(200, headers={"Content-Length": str(size)}, content=b"x" * min(size, 4096))


@pytest.fixture
def upstream(monkeypatch):
    up = Upstream({MULK: int(13.6 * MB), BAQARA: int(207 * MB)})
    monkeypatch.setattr(downloads, "_http", lambda: httpx.AsyncClient(transport=httpx.MockTransport(up), follow_redirects=False))
    downloads.reset()
    yield up
    downloads.reset()


@pytest.fixture
def mushaf(monkeypatch):
    rec = {
        "id": "islamhouse-728787",
        "reciter": {"ar": "ماهر بن حمد المعيقلي", "en": "Maher Al-Muaiqly", "tl": "Maher Al-Muaiqly"},
        "edition": {lg: "Recited mushaf" for lg in ("ar", "en", "tl")},
        "origin_url": "https://islamhouse.com/ar/quran/728787/",
        "suras": {"1": FATIHA, "2": BAQARA, "67": MULK},
    }
    monkeypatch.setattr(recitation, "load", lambda: [rec])
    return rec


def _items(cat: dict) -> dict[str, dict]:
    return {i["id"]: i for items in cat["sections"].values() for i in items}


async def _catalog(client, lang="ar") -> dict:
    r = await client.get(f"/api/downloads/catalog?lang={lang}")
    assert r.status_code == 200, r.text
    return r.json()


# --- R1: what can be downloaded, with sizes, in three sections ---------------------------


async def test_plt12_r1_catalog_has_three_sections_and_units_with_sizes(client, upstream, mushaf):
    cat = await _catalog(client)
    assert set(cat["sections"]) == {"lessons", "quran", "library"}
    unit = _items(cat)["unit:u01:ar"]
    assert unit["section"] == "lessons" and unit["title"]
    assert unit["sizes_known"] and unit["bytes"] == sum(f["bytes"] for f in unit["files"]) > 0
    assert all(i["section"] == "lessons" for i in cat["sections"]["lessons"]) and len(cat["sections"]["lessons"]) > 1


# --- R2: units the learner understands; size before download -----------------------------


async def test_plt12_r2_unit_carries_its_lessons_text_photos_and_media_in_language(client, upstream, mushaf):
    files = {f["key"]: f for f in _items(await _catalog(client))["unit:u01:ar"]["files"]}
    assert "/api/content?lang=ar" in files  # the approved lessons' text, as the app asks for it
    assert not [k for k in files if k.endswith(".mp4")]  # owner decision 2026-10-10: no videos in a unit download
    assert any(k.endswith(".mp3") for k in files)  # its audio (Al-Fatiha) stays
    assert any(k.startswith("/api/content/media/unit-01/images/") for k in files)  # step photos
    assert all(f["url"] == f"/api/downloads/file/{f['id']}" for k, f in files.items() if k.startswith("https://"))  # same origin only


async def test_plt12_videos_are_items_of_their_own_outside_the_unit_size(client, upstream, mushaf):
    """Owner decision 2026-10-10: a unit downloads without its videos; each video is offered apart, with its size."""
    wudu = "https://d1.islamhouse.com/data/ar/ih_videos/mp4/single/ar-sifat-alwoduo.mp4"
    upstream.sizes[wudu] = int(22 * MB)
    items = _items(await _catalog(client))
    unit = items["unit:u01:ar"]
    assert unit["bytes"] < 10 * MB  # text, photos, audio (the 22 MB video is not counted)
    videos = [i for i in items.values() if i["kind"] == "video" and i["unit"] == "u01"]
    assert len(videos) == 2 and all("/ar/" in i["files"][0]["key"] for i in videos)  # wudu + prayer, once each, Arabic only
    one = next(i for i in videos if i["files"][0]["key"] == wudu)
    assert one["id"] == f"video:{downloads.file_id(wudu)}" and one["section"] == "lessons" and one["title"]
    assert one["bytes"] == int(22 * MB) and one["downloadable"]
    assert (await client.get(f"/api/downloads/catalog/{one['id']}?lang=ar")).json()["bytes"] == int(22 * MB)
    r = await client.get(one["files"][0]["url"], headers={"Range": "bytes=0-99"})  # streamed on play, by its id
    assert r.status_code == 206


async def test_plt12_r2_item_detail_resolves_every_size_before_download(client, upstream, mushaf):
    r = await client.get("/api/downloads/catalog/surah:67:tl?lang=tl")
    assert r.status_code == 200
    item = r.json()
    meaning = [f for f in item["files"] if "quranenc" in f["key"]]
    assert len(meaning) == 30  # Al-Mulk: the Tagalog meaning audio of every verse (QuranEnc)
    assert item["sizes_known"] and item["bytes"] >= int(13.6 * MB)


async def test_plt12_r2_quran_text_is_the_readers_own_requests_from_the_database(client, upstream, mushaf):
    assert "quran-text:en" not in _items(await _catalog(client, "en"))  # nothing loaded: nothing offered
    await add_passages({"id": "quranenc:1:1", "kind": "quran_arabic", "lang": "ar", "ref_key": "1:1", "quote_text": "نص"}, embed=False)
    downloads.reset()  # the catalogue is rebuilt at most every 5 minutes (security review A-M2)
    text = _items(await _catalog(client, "en"))["quran-text:en"]
    keys = [f["key"] for f in text["files"]]
    assert "/api/scripture/quran?sura=2&from=241&to=280&lang=en" in keys and "/api/scripture/quran?sura=114&from=1&to=6&lang=en" in keys
    assert len(keys) == sum((n + 39) // 40 for n in downloads.AYA_COUNT)


# --- R3: text changes silently, media changes are offered ------------------------------


async def test_plt12_r3_changed_text_changes_the_version_but_not_the_files(client, upstream, mushaf, monkeypatch):
    items = [
        {
            "id": f"ih-{i}-ar",
            "external_id": str(i),
            "type": "books",
            "topic": "basics",
            "lang": "ar",
            "title": f"كتاب {i}",
            "authors": [],
            "description": "",
            "origin_url": f"https://islamhouse.com/ar/books/{i}/",
            "files": [{"url": f"https://d1.islamhouse.com/data/ar/{i}.pdf", "ext": "pdf", "size": "2 MB"}],
        }
        for i in (1, 2)
    ]
    monkeypatch.setattr(library, "load", lambda: items)
    before = _items(await _catalog(client))["lib:ih-1-ar"]
    items[0] = {**items[0], "description": "وصف مصحح"}
    downloads.reset()  # the catalogue is rebuilt at most every 5 minutes (security review A-M2)
    after = _items(await _catalog(client))["lib:ih-1-ar"]
    assert after["version"] != before["version"]
    assert [f["key"] for f in after["files"]] == [f["key"] for f in before["files"]]  # the device refreshes text only


# --- R4: no device or account id in a download ---------------------------------------------


async def test_plt12_r4_download_needs_no_account_and_sets_nothing(client, upstream, mushaf):
    item = _items(await _catalog(client))["surah:67:ar"]
    media = next(f for f in item["files"] if f["kind"] == "media")
    r = await client.get(media["url"])
    assert r.status_code == 200 and "set-cookie" not in r.headers and r.headers["cache-control"] == "no-store"
    assert "authorization" not in upstream.seen[-1].headers and "cookie" not in upstream.seen[-1].headers


async def test_plt12_r4_nothing_logged_about_who_downloaded_what(client, upstream, mushaf, caplog):
    media = next(f for f in _items(await _catalog(client))["surah:67:ar"]["files"] if f["kind"] == "media")
    with caplog.at_level(logging.DEBUG, logger="app"):
        await client.get(media["url"], headers={"X-Forwarded-For": "203.0.113.9"})
    assert not [
        r for r in caplog.records if r.name.startswith("app") and (media["id"] in r.getMessage() or "203.0.113.9" in r.getMessage())
    ]


# --- R5: resume from the last complete file (Range is passed through) ---------------------


async def test_plt12_r5_range_request_is_forwarded_and_answered_206(client, upstream, mushaf):
    media = next(f for f in _items(await _catalog(client))["surah:67:ar"]["files"] if f["kind"] == "media")
    r = await client.get(media["url"], headers={"Range": "bytes=100-199"})
    assert r.status_code == 206 and r.headers["content-range"].startswith("bytes 100-199/") and len(r.content) == 100
    assert upstream.seen[-1].headers["range"] == "bytes=100-199"


# --- R6: only what the licence allows; the pass-through takes catalogue ids only -----------


async def test_plt12_r6_islamhouse_surah_is_offered_with_its_size(client, upstream, mushaf):
    mulk = _items(await _catalog(client))["surah:67:ar"]
    rec = next(f for f in mulk["files"] if f["key"] == MULK)
    assert rec["bytes"] == int(13.6 * MB) and mulk["downloadable"]


async def test_plt12_r6_quranpedia_recitations_are_never_in_the_catalog(client, upstream, mushaf):
    for lang in ("ar", "en", "tl"):
        assert "quranpedia" not in json.dumps(await _catalog(client, lang))


async def test_plt12_r6_file_over_the_cap_is_streamed_only(client, upstream, mushaf, monkeypatch):
    monkeypatch.setattr(downloads, "CAP_BYTES", 200 * MB)
    downloads.reset()
    baqara = _items(await _catalog(client))["surah:2:ar"]
    assert not baqara["downloadable"] and baqara["reason"] == "too_large"
    media = next(f for f in baqara["files"] if f["key"] == BAQARA)
    assert (await client.get(media["url"])).status_code == 413


async def test_plt12_r6_streaming_stops_at_the_cap_without_a_length(client, upstream, mushaf, monkeypatch):
    def endless(request: httpx.Request) -> httpx.Response:
        resp = httpx.Response(200, content=b"y" * 5000)
        del resp.headers["content-length"]  # no length known up front
        return resp

    media = next(f for f in _items(await _catalog(client))["surah:67:ar"]["files"] if f["kind"] == "media")
    monkeypatch.setattr(downloads, "_http", lambda: httpx.AsyncClient(transport=httpx.MockTransport(endless), follow_redirects=False))
    monkeypatch.setattr(downloads, "CAP_BYTES", 100)

    async def index(_session):
        return {media["id"]: {"url": MULK, "bytes": None, "mime": "audio/mpeg"}}

    monkeypatch.setattr(downloads, "file_index", index)
    with pytest.raises(downloads.OverCap):  # the response is aborted, never ended as if complete
        await client.get(media["url"])


async def test_plt12_r6_unknown_id_is_404(client, upstream, mushaf):
    assert (await client.get("/api/downloads/file/f" + "0" * 24)).status_code == 404
    assert (await client.get("/api/downloads/file/not-an-id")).status_code == 404
    assert upstream.seen == [] or all(r.method == "HEAD" for r in upstream.seen)


async def test_plt12_r6_a_url_is_never_accepted(client, upstream, mushaf):
    for bad in ("https%3A%2F%2Fd1.islamhouse.com%2Fx.mp3", "http://127.0.0.1:5442/", "..%2F..%2Fetc%2Fpasswd"):
        assert (await client.get(f"/api/downloads/file/{bad}")).status_code == 404
    assert not downloads.allowed_url("https://evil.example/d1.islamhouse.com.mp3")
    assert not downloads.allowed_url("https://d1.islamhouse.com.evil.example/x.mp3")
    assert not downloads.allowed_url("http://d1.islamhouse.com/x.mp3")
    assert not downloads.allowed_url("https://user@d1.islamhouse.com/x.mp3")
    assert not downloads.allowed_url("https://d1.islamhouse.com:8443/x.mp3")


async def test_plt12_r6_redirect_is_never_followed(client, upstream, mushaf):
    media = next(f for f in _items(await _catalog(client))["surah:67:ar"]["files"] if f["kind"] == "media")
    upstream.redirect = True
    upstream.seen.clear()
    r = await client.get(media["url"])
    assert r.status_code == 502
    assert [str(x.url) for x in upstream.seen] == [MULK]  # one request; the Location was never fetched


async def test_plt12_r6_returned_library_item_is_not_offered(client, upstream, mushaf, monkeypatch):
    items = [
        {
            "id": "ih-9-tl",
            "external_id": "9",
            "type": "books",
            "topic": "basics",
            "lang": "tl",
            "title": "Aklat",
            "authors": [],
            "description": "",
            "origin_url": "https://islamhouse.com/tl/books/9/",
            "files": [{"url": "https://d1.islamhouse.com/data/tl/9.pdf", "ext": "pdf", "size": "1.5 MB"}],
        }
    ]
    monkeypatch.setattr(library, "load", lambda: items)
    item = _items(await _catalog(client, "tl"))["lib:ih-9-tl"]
    assert item["bytes"] >= int(1.5 * MB)
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "library_item", "ih-9-tl", "tl")
    downloads.reset()
    assert "lib:ih-9-tl" not in _items(await _catalog(client, "tl"))
    media = item["files"][-1]
    assert (await client.get(media["url"])).status_code == 404  # a withdrawn file cannot be fetched by its old id


async def test_plt12_r6_concurrent_downloads_per_client_are_limited(client, upstream, mushaf, monkeypatch):
    media = next(f for f in _items(await _catalog(client))["surah:67:ar"]["files"] if f["kind"] == "media")
    monkeypatch.setitem(downloads._active, "127.0.0.1", downloads.MAX_CONCURRENT)
    assert (await client.get(media["url"])).status_code == 429
