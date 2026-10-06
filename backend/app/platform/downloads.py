"""PLT-12 download center: what may be kept on the device, and the pass-through.

Catalogue (R1, R2, R6): `GET /api/downloads/catalog?lang=` lists, in three
sections, the items a learner can download, each with its files and sizes:

- lessons: one item per path unit in that language (its approved lessons'
  text, step photos, videos and audio in that language);
- quran: the Quran text with the learner's translation (from the stored
  QuranEnc records, the exact URLs the reader asks for), and one item per
  surah of the approved IslamHouse recitation (plus the QuranEnc Tagalog
  meaning audio for Tagalog);
- library: approved, link-healthy library items, their files.

Only what the source's licence lets us keep offline is listed (R6): IslamHouse
and QuranEnc. Quranpedia per-verse recitations (lessons' verse audio and the
listening reciters) are never in the catalogue; adhkar audio neither.

Pass-through (open question, decided 2026-10-06): IslamHouse and QuranEnc send
no CORS headers and the page may only connect to Rafeeq, so the device fetches
an external file through `GET /api/downloads/file/{file_id}`. The id is looked
up in the catalogue of approved content (never a URL from the request); the
file is streamed from an allowlisted host without following redirects, never
stored, with the client's Range forwarded; at most CAP_BYTES per file. No
device or account id goes in, and nothing about who downloaded what is logged.
"""

import asyncio
import hashlib
import json
import re
import time
from contextlib import suppress
from typing import Any, Literal
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.config import get_settings
from app.core.deps import Session
from app.knowledge import glossary, library, recitation
from app.knowledge.models import Passage, Source
from app.knowledge.review import fingerprint, published
from app.learning.content import build_content
from app.learning.team_units import MEDIA_ROUTE

router = APIRouter(prefix="/api/downloads", tags=["downloads"])
Lang = Literal["ar", "en", "tl"]
LANGS = ("ar", "en", "tl")

# Lead decision 2026-10-06: refuse any file over 300 MB (it stays streamed only).
CAP_BYTES = 300 * 1024 * 1024
# R6: hosts whose licence allows offline copies (sources.md). Exact host names; https only.
FILE_HOSTS = frozenset(
    {
        "d1.islamhouse.com",
        "d2.islamhouse.com",
        "islamhouse.com",
        "ih-download.islamenc.com",  # IslamHouse's download host (unit 1 English prayer video)
        "d.quranenc.com",  # QuranEnc Tagalog meaning audio
    }
)
MEANING_AUDIO = "https://d.quranenc.com/data/audio/tagalog_rwwad/{sura:03d}{aya:03d}.mp3"
# Per client: requests per window, and files streaming at once (in memory only, never logged).
RATE, RATE_WINDOW_S = 900, 600
MAX_CONCURRENT = 3
PAGE = 40  # ayat per /api/scripture/quran call, as the reader pages (discover/verses.ts)
# Estimated bytes of one verse in /api/scripture/quran (41 verses with English ≈ 22 KB, measured 2026-10-06).
VERSE_BYTES = {"ar": 330, "en": 560, "tl": 560}
AYA_COUNT = (
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69,
    60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11,
    11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19,
    5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
)  # fmt: skip
MIME = {
    "mp4": "video/mp4",
    "mp3": "audio/mpeg",
    "m4a": "audio/mp4",
    "pdf": "application/pdf",
    "webp": "image/webp",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "epub": "application/epub+zip",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_ID = re.compile(r"^f[0-9a-f]{24}$")
_RANGE = re.compile(r"^bytes=\d*-\d*$")


def allowed_url(url: str) -> bool:
    """https on an allowlisted host, default port, no credentials (no SSRF)."""
    try:
        u = urlsplit(url)
    except ValueError:
        return False
    return u.scheme == "https" and u.hostname in FILE_HOSTS and u.port is None and not u.username and not u.password


def file_id(url: str) -> str:
    return "f" + hashlib.sha256(url.encode()).hexdigest()[:24]


def mime_of(url: str, ext: str | None = None) -> str:
    e = (ext or url.rsplit(".", 1)[-1]).lower().split("?")[0]
    return MIME.get(e, "application/octet-stream")


def parse_size(text: str | None) -> int | None:
    """'10.25 MB' → bytes (IslamHouse's size field)."""
    m = re.fullmatch(r"\s*([\d.]+)\s*(B|KB|MB|GB)\s*", text or "", re.IGNORECASE)
    if not m:
        return None
    mult = {"B": 1, "KB": 1024, "MB": 1024**2, "GB": 1024**3}[m.group(2).upper()]
    return int(float(m.group(1)) * mult)


def _http() -> httpx.AsyncClient:
    """Outbound client: never follows redirects (tests replace it with a mock transport)."""
    return httpx.AsyncClient(timeout=httpx.Timeout(20.0, read=60.0), follow_redirects=False)


# --- sizes (HEAD, cached in process memory: URLs only, nothing about anyone) ---------------

_sizes: dict[str, int | None] = {}


async def _head(client: httpx.AsyncClient, url: str) -> None:
    try:
        r = await client.head(url)
        _sizes[url] = int(r.headers["content-length"]) if r.status_code == 200 and "content-length" in r.headers else None
    except (httpx.HTTPError, ValueError):
        pass  # unknown for now; asked again next time


async def resolve_sizes(urls: list[str], budget_s: float) -> None:
    todo = [u for u in dict.fromkeys(urls) if u not in _sizes and allowed_url(u)]
    if not todo:
        return
    sem = asyncio.Semaphore(12)
    async with _http() as client:

        async def one(u: str) -> None:
            async with sem:
                await _head(client, u)

        with suppress(TimeoutError):
            await asyncio.wait_for(asyncio.gather(*(one(u) for u in todo)), budget_s)


# --- catalogue -------------------------------------------------------------------------------


def _text(path: str, size: int) -> dict:
    return {
        "id": "t" + hashlib.sha256(path.encode()).hexdigest()[:24],
        "url": path,
        "key": path,
        "bytes": size,
        "mime": "application/json",
        "kind": "text",
    }


def _media(url: str, size: int | None = None, ext: str | None = None) -> dict:
    """An external file: fetched through the pass-through, kept under its original URL
    (the URL the page's <video>/<audio>/link asks for)."""
    fid = file_id(url)
    return {
        "id": fid,
        "url": f"/api/downloads/file/{fid}",
        "key": url,
        "bytes": size if size is not None else _sizes.get(url),
        "mime": mime_of(url, ext),
        "kind": "media",
    }


def _local_image(path: str) -> dict | None:
    rel = path.removeprefix(MEDIA_ROUTE + "/")
    f = get_settings().content_dir / "units" / rel
    if ".." in rel or not f.is_file():
        return None
    return {
        "id": "t" + hashlib.sha256(path.encode()).hexdigest()[:24],
        "url": path,
        "key": path,
        "bytes": f.stat().st_size,
        "mime": mime_of(path),
        "kind": "media",
    }


def _verses(sura: int, start: int, end: int, lang: str) -> dict:
    # Exactly the URL the app requests (discover/verses.ts, lesson/VerseBlock.tsx), so the worker finds it.
    return _text(f"/api/scripture/quran?sura={sura}&from={start}&to={end}&lang={lang}", VERSE_BYTES[lang] * (end - start + 1))


def _sura_pages(sura: int, lang: str) -> list[dict]:
    n = AYA_COUNT[sura - 1]
    return [_verses(sura, a, min(n, a + PAGE - 1), lang) for a in range(1, n + 1, PAGE)]


def _item(item_id: str, section: str, kind: str, ref: str, title: str, files: list[dict], text_version: Any) -> dict:
    files = list({f["key"]: f for f in files if f}.values())
    media = [f for f in files if f["kind"] == "media" and f["url"].startswith("/api/downloads/file/")]
    too_large = any((f["bytes"] or 0) > CAP_BYTES for f in media)
    unknown = any(f["bytes"] is None for f in files)
    return {
        "id": item_id,
        "section": section,
        "kind": kind,
        "ref": ref,
        "title": title,
        "files": files,
        "bytes": sum(f["bytes"] or 0 for f in files),
        "sizes_known": not unknown,
        # R3: a change of text only is fetched silently; a change of a media file is offered.
        "version": fingerprint({"text": text_version, "files": sorted(f["key"] for f in files)}),
        "downloadable": not too_large,
        "reason": "too_large" if too_large else None,
    }


def _json_bytes(data: Any) -> int:
    return len(json.dumps(data, ensure_ascii=False).encode())


async def _lessons(session: AsyncSession, lang: str) -> list[dict]:
    units_live = await published(session, "unit", lang)
    lessons_live = await published(session, "lesson", lang)
    content = build_content(lang, units_live, lessons_live, False)
    path_file = _text(f"/api/content?lang={lang}", _json_bytes(content))
    terms_file = _text(f"/api/glossary?lang={lang}", _json_bytes({"lang": lang, "terms": await glossary.approved_terms(session, lang)}))
    out = []
    for u in content["units"]:
        files = [path_file, terms_file]
        lessons = [content["lessons"][lid] for lid in u["lessons"]]
        for lesson in lessons:
            video = (lesson.get("media") or {}).get("video")
            if isinstance(video, str) and allowed_url(video):
                files.append(_media(video))
            for card in lesson.get("cards") or []:
                q = card.get("quran")
                if isinstance(q, dict) and q.get("ayat"):
                    files.append(_verses(q["sura"], q["ayat"][0], q["ayat"][1], lang))
                for img in [card.get("image_url"), *(card.get("extra_images") or [])]:
                    if isinstance(img, str) and img.startswith(MEDIA_ROUTE + "/"):
                        files.append(_local_image(img))
                # Unit audio in this language (IslamHouse). Verse recitation (`quran.recite`) is
                # Quranpedia's and is never downloaded (R6).
                for a in card.get("audio") or []:
                    if isinstance(a, str) and allowed_url(a):
                        files.append(_media(a))
        title = u.get("title") if isinstance(u.get("title"), str) else u["id"]
        out.append(_item(f"unit:{u['id']}:{lang}", "lessons", "unit", u["id"], title, files, {"unit": u, "lessons": lessons}))
    return out


async def _quran(session: AsyncSession, lang: str) -> list[dict]:
    out = []
    loaded = await session.scalar(select(Passage.id).where(Passage.source_id == "quranenc", Passage.kind == "quran_arabic").limit(1))
    src = await session.get(Source, "quranenc")
    if loaded:
        pages = [p for s in range(1, 115) for p in _sura_pages(s, lang)]
        out.append(_item(f"quran-text:{lang}", "quran", "quran_text", "all", "", pages, src.versions if src else None))
    live = await published(session, recitation.ITEM_TYPE, lang)
    rec = next((r for r in recitation.load() if r["id"] in live), None)
    if rec is None:
        return out
    rec_file = _text(f"/api/discover/recitations?lang={lang}", 2048)
    sizes = rec.get("sizes") or {}  # PLT-11 may add a measured size per surah
    for n in range(1, 115):
        url = rec["suras"].get(str(n))
        if not url or not allowed_url(url):
            continue
        files = [rec_file, _media(url, sizes.get(str(n))), *_sura_pages(n, lang)]
        if lang == "tl":  # R2: the meaning audio of the learner's language where it exists (QuranEnc Tagalog)
            files += [_media(MEANING_AUDIO.format(sura=n, aya=a)) for a in range(1, AYA_COUNT[n - 1] + 1)]
        out.append(
            _item(f"surah:{n}:{lang}", "quran", "surah", str(n), live[rec["id"]].get("reciter", ""), files, src.versions if src else None)
        )
    return out


async def _library(session: AsyncSession, lang: str) -> list[dict]:
    live = await published(session, library.ITEM_TYPE, lang)
    hidden = await library.hidden_ids(session)
    snaps = [live[it["id"]] for it in library.load() if it["id"] in live and it["id"] not in hidden]
    list_file = _text(f"/api/discover/library?lang={lang}", _json_bytes({"lang": lang, "topics": library.learner_topics(live, hidden)}))
    out = []
    for snap in snaps:
        media = [_media(f["url"], parse_size(f.get("size")), f.get("ext")) for f in snap.get("files", []) if allowed_url(f.get("url", ""))]
        if not media:
            continue
        out.append(_item(f"lib:{snap['id']}", "library", snap.get("type", "file"), snap["id"], snap["title"], [list_file, *media], snap))
    return out


async def build_catalog(session: AsyncSession, lang: str) -> dict:
    return {
        "lang": lang,
        "cap_bytes": CAP_BYTES,
        "sections": {
            "lessons": await _lessons(session, lang),
            "quran": await _quran(session, lang),
            "library": await _library(session, lang),
        },
    }


def _all_items(cat: dict) -> list[dict]:
    return [i for items in cat["sections"].values() for i in items]


@router.get("/catalog")
async def catalog(session: Session, response: Response, lang: Lang = "ar") -> dict:
    """R1/R2: everything downloadable in `lang`, with sizes. The same for everyone."""
    first = await build_catalog(session, lang)
    # Sizes of unit media and of each surah's recitation file (not the per-verse meaning audio,
    # asked per item below). A short budget: what is not known yet shows as unknown.
    urls = [
        f["key"] for i in _all_items(first) if i["section"] != "library" for f in i["files"] if f["kind"] == "media" and f["bytes"] is None
    ]
    urls = [u for u in urls if not u.startswith(MEANING_AUDIO[:40])]
    if urls:
        await resolve_sizes(urls, budget_s=6.0)
        first = await build_catalog(session, lang)
    response.headers["Cache-Control"] = "public, max-age=300"
    return first


@router.get("/catalog/{item_id}")
async def catalog_item(item_id: str, session: Session, response: Response, lang: Lang = "ar") -> dict:
    """R2: one item with every file's size, asked before its download starts."""
    item = next((i for i in _all_items(await build_catalog(session, lang)) if i["id"] == item_id), None)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    unknown = [f["key"] for f in item["files"] if f["bytes"] is None]
    if unknown:
        await resolve_sizes(unknown, budget_s=20.0)
        item = next(i for i in _all_items(await build_catalog(session, lang)) if i["id"] == item_id)
    response.headers["Cache-Control"] = "public, max-age=300"
    return item


# --- pass-through ------------------------------------------------------------------------------

_index: tuple[float, dict[str, dict]] = (0.0, {})
INDEX_TTL_S = 300


async def file_index(session: AsyncSession) -> dict[str, dict]:
    """file id → the external file, from the catalogues of every language (approved content only)."""
    global _index
    at, idx = _index
    if time.monotonic() - at < INDEX_TTL_S and idx:
        return idx
    idx = {}
    for lang in LANGS:
        for item in _all_items(await build_catalog(session, lang)):
            for f in item["files"]:
                if f["url"].startswith("/api/downloads/file/"):
                    idx[f["id"]] = {"url": f["key"], "bytes": f["bytes"], "mime": f["mime"]}
    _index = (time.monotonic(), idx)
    return idx


def reset() -> None:
    """Tests: forget cached sizes and the file index."""
    global _index
    _index = (0.0, {})
    _sizes.clear()
    _active.clear()


_active: dict[str, int] = {}


class OverCap(Exception):
    """The upstream file grew past CAP_BYTES while streaming."""


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "-"  # in memory only, for the limits


@router.get("/file/{fid}")
async def file(fid: str, request: Request, session: Session) -> StreamingResponse:
    """Stream one approved file by its catalogue id. Nothing is stored or logged."""
    entry = (await file_index(session)).get(fid) if _ID.fullmatch(fid) else None
    if entry is None or not allowed_url(entry["url"]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    if (entry["bytes"] or 0) > CAP_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "too_large")
    key = _client_key(request)
    ratelimit.hit(f"dl:{key}", RATE, RATE_WINDOW_S)
    if _active.get(key, 0) >= MAX_CONCURRENT:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited")
    _active[key] = _active.get(key, 0) + 1

    def release() -> None:
        _active[key] = _active.get(key, 1) - 1
        if _active[key] <= 0:
            _active.pop(key, None)

    rng = request.headers.get("range")
    client = _http()
    try:
        upstream = await client.send(
            client.build_request("GET", entry["url"], headers={"Range": rng} if rng and _RANGE.fullmatch(rng) else {}), stream=True
        )
    except httpx.HTTPError:
        await client.aclose()
        release()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "upstream") from None
    total = upstream.headers.get("content-range", "").rpartition("/")[2] or upstream.headers.get("content-length", "")
    if upstream.status_code not in (200, 206) or (total.isdigit() and int(total) > CAP_BYTES):
        code = upstream.status_code
        await upstream.aclose()
        await client.aclose()
        release()
        if code in (200, 206):
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "too_large")
        if code == 416:
            raise HTTPException(status.HTTP_416_RANGE_NOT_SATISFIABLE, "bad_range")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "upstream")  # includes any redirect: never followed
    # X-Accel-Buffering: nginx passes the stream on instead of spooling it to disk (nothing stored).
    headers = {"Content-Type": entry["mime"], "Accept-Ranges": "bytes", "Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    for h in ("content-length", "content-range"):
        if h in upstream.headers:
            headers[h.title()] = upstream.headers[h]

    async def body():
        sent = 0
        try:
            async for chunk in upstream.aiter_bytes():
                sent += len(chunk)
                if sent > CAP_BYTES:
                    # The cap holds even when the host sent no length. Aborting (not ending cleanly)
                    # tells the device the file is incomplete, so it never keeps a partial file (R5).
                    raise OverCap
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()
            release()

    return StreamingResponse(body(), status_code=upstream.status_code, headers=headers)
