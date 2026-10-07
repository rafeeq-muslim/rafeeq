"""Security review 2026-10-07, A-M2: the download centre's catalogue is built
at most once in 5 minutes per language, both catalogue routes are limited per
address, a size that cannot be read is not asked again at once, and outbound
calls share one client and two global ceilings (streams, size questions)."""

import asyncio

import httpx
import pytest

from app.knowledge import recitation
from app.platform import downloads

MULK = "https://d1.islamhouse.com/data/ar/ih_quran/maher/ar-067-maher.mp3"


class Upstream:
    """Stand-in for the file hosts: counts requests, can fail QuranEnc, and
    records how many requests were in flight at once."""

    def __init__(self):
        self.seen: list[httpx.Request] = []
        self.fail_quranenc = False
        self.in_flight = 0
        self.peak = 0

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.seen.append(request)
        self.in_flight += 1
        self.peak = max(self.peak, self.in_flight)
        try:
            await asyncio.sleep(0.005)
            if self.fail_quranenc and request.url.host == "d.quranenc.com":
                raise httpx.ConnectError("down", request=request)
            if request.method == "HEAD":
                return httpx.Response(200, headers={"Content-Length": "1000"})
            return httpx.Response(200, headers={"Content-Length": "4"}, content=b"data")
        finally:
            self.in_flight -= 1

    def heads(self, host: str) -> int:
        return sum(1 for r in self.seen if r.method == "HEAD" and r.url.host == host)


@pytest.fixture
def upstream(monkeypatch):
    up = Upstream()
    shared = httpx.AsyncClient(transport=httpx.MockTransport(up), follow_redirects=False)
    up.client = shared
    monkeypatch.setattr(downloads, "_http", lambda: shared)
    rec = {
        "id": "islamhouse-728787",
        "reciter": {lg: "Maher Al-Muaiqly" for lg in ("ar", "en", "tl")},
        "edition": {lg: "Recited mushaf" for lg in ("ar", "en", "tl")},
        "origin_url": "https://islamhouse.com/ar/quran/728787/",
        "suras": {"67": MULK},
    }
    monkeypatch.setattr(recitation, "load", lambda: [rec])
    downloads.reset()
    yield up
    downloads.reset()


async def test_m2_the_catalogue_is_built_once_and_served_from_memory(client, upstream, monkeypatch):
    builds = 0
    real = downloads._lessons

    async def counted(session, lang):
        nonlocal builds
        builds += 1
        return await real(session, lang)

    monkeypatch.setattr(downloads, "_lessons", counted)
    first = (await client.get("/api/downloads/catalog?lang=tl")).json()
    after_first = builds
    assert after_first <= 2  # once, and once more with the sizes it learnt
    for _ in range(5):
        again = (await client.get("/api/downloads/catalog?lang=tl")).json()
        assert [i["id"] for i in again["sections"]["quran"]] == [i["id"] for i in first["sections"]["quran"]]
        assert (await client.get("/api/downloads/catalog/surah:67:tl?lang=tl")).status_code == 200
    assert builds <= after_first + 1  # the item's own sizes were learnt once; nothing else rebuilt it
    await client.get("/api/downloads/catalog?lang=en")
    await client.get("/api/downloads/catalog?lang=tl")
    assert builds <= after_first + 4  # another language is its own catalogue (sizes it learnt rebuild both once)

    # after 5 minutes it is built again
    downloads._catalogs["tl"] = (downloads._catalogs["tl"][0] - downloads.CATALOG_TTL_S - 1, downloads._catalogs["tl"][1])
    before = builds
    await client.get("/api/downloads/catalog?lang=tl")
    assert builds == before + 1


async def test_m2_both_catalogue_routes_are_limited_per_address(client, upstream):
    for _ in range(downloads.CATALOG_PER_MIN):
        assert (await client.get("/api/downloads/catalog")).status_code == 200
    assert (await client.get("/api/downloads/catalog")).status_code == 429
    for _ in range(downloads.ITEM_PER_MIN):
        assert (await client.get("/api/downloads/catalog/surah:67:ar")).status_code == 200
    assert (await client.get("/api/downloads/catalog/surah:67:ar")).status_code == 429


async def test_m2_a_size_that_cannot_be_read_is_not_asked_again_at_once(client, upstream):
    upstream.fail_quranenc = True
    for _ in range(3):
        r = await client.get("/api/downloads/catalog/surah:67:tl?lang=tl")
        assert r.status_code == 200 and r.json()["sizes_known"] is False
    assert upstream.heads("d.quranenc.com") == 30  # Al-Mulk's 30 verses, asked once, not three times

    # later (HEAD_RETRY_S) the host is asked again, and the sizes arrive
    upstream.fail_quranenc = False
    for url in list(downloads._failed):
        downloads._failed[url] -= downloads.HEAD_RETRY_S + 1
    r = await client.get("/api/downloads/catalog/surah:67:tl?lang=tl")
    assert r.json()["sizes_known"] is True and upstream.heads("d.quranenc.com") == 60


async def test_m2_size_questions_share_one_ceiling(upstream):
    urls = [f"https://d.quranenc.com/data/audio/tagalog_rwwad/002{a:03d}.mp3" for a in range(1, 201)]
    await asyncio.gather(*(downloads.resolve_sizes(urls[i::4], budget_s=20) for i in range(4)))
    assert len(downloads._sizes) == 200
    assert upstream.peak <= downloads.MAX_HEADS == 12  # before: 12 per request, 48 here


async def test_m2_streams_share_one_ceiling_and_one_client(client, upstream, monkeypatch):
    media = next(f for f in (await client.get("/api/downloads/catalog/surah:67:ar")).json()["files"] if f["kind"] == "media")
    for _ in range(3):
        r = await client.get(media["url"])
        assert r.status_code == 200 and r.content == b"data"
    assert downloads._streams == 0 and not downloads._active  # every stream gave its place back
    assert upstream.client.is_closed is False  # the shared client stays open between requests

    monkeypatch.setattr(downloads, "_streams", downloads.MAX_STREAMS)  # other addresses fill the ceiling
    assert (await client.get(media["url"])).status_code == 429


def test_m2_the_modules_own_client_is_one_bounded_pool(monkeypatch):
    monkeypatch.setattr(downloads, "_client", None)
    a, b = downloads._http(), downloads._http()
    assert a is b and a.follow_redirects is False
