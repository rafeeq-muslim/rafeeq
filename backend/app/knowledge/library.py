"""KNW-06: the library.

Candidates come from IslamHouse API v3 (documented public key, "free to
use"; IslamHouse policy allows apps and storage, text unchanged, cite the
source). `--fetch` stores **metadata and file links only** in
`content/discover/library.json`; nothing is shown until the Sharia reviewer
approves the item (KNW-06 R1). Every candidate is one KNW-05 review item
(`library_item`) in its own language.

Link health (R1 error): `check_library_links()` runs daily and records dead
items in `knw_library_items` (status `hidden`); the learner list skips them.

Fetch: `uv run python -m app.knowledge.library --fetch`
Check links now: `uv run python -m app.knowledge.library --check-links`
"""

import argparse
import asyncio
import json
import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.knowledge import review
from app.knowledge.models import LibraryItem
from app.knowledge.review import ReviewItem

log = logging.getLogger(__name__)

ITEM_TYPE = "library_item"
LANGS = ("ar", "en", "tl")
API = "https://api3.islamhouse.com/v3/paV29H2gm56kvLPy"
# The two curated IslamHouse categories items are fetched from. Learners see
# them grouped by the path's units instead (KNW-06 R2, see learner_topics).
TOPICS = {"basics": 179666, "stories": 221824}
GENERAL = "general"  # KNW-06 R2: items not linked to a unit («عام»)
TYPES = ("books", "articles", "videos", "audios")
# R5: only files on IslamHouse's own hosts (no ads, no tracking, no video platform).
FILE_HOSTS = ("d1.islamhouse.com", "islamhouse.com", "d2.islamhouse.com")


def library_file() -> Path:
    return get_settings().content_dir / "discover" / "library.json"


@lru_cache
def load() -> list[dict[str, Any]]:
    f = library_file()
    if not f.exists():
        return []
    return json.loads(f.read_text(encoding="utf-8"))["items"]


def item_view(it: dict) -> dict:
    """What the learner (and the reviewer) sees: R3's source card fields."""
    return {
        "id": it["id"],
        "type": it["type"],
        "topic": it["topic"],
        "lang": it["lang"],
        "title": it["title"],
        "authors": it.get("authors", []),
        "description": it.get("description", ""),
        "source": "IslamHouse.com",
        "origin_url": it["origin_url"],
        "files": it.get("files", []),
    }


def _review_items() -> Iterable[ReviewItem]:
    for i, it in enumerate(load()):
        yield ReviewItem(ITEM_TYPE, it["id"], order=(it["topic"], i), group=it["topic"], views={it["lang"]: item_view(it)})


review.register(ITEM_TYPE, _review_items)


async def hidden_ids(session: AsyncSession) -> set[str]:
    rows = await session.scalars(select(LibraryItem.external_id).where(LibraryItem.status == "hidden"))
    return set(rows)


@lru_cache
def unit_links() -> dict[str, str]:
    """KNW-06 R2: item id -> path unit id, from content/discover/library-units.json.
    Kept apart from the items so arranging them never changes an approved version."""
    f = get_settings().content_dir / "discover" / "library-units.json"
    if not f.exists():
        return {}
    data = json.loads(f.read_text(encoding="utf-8"))
    return {iid: uid for uid, ids in data["units"].items() for iid in ids}


@lru_cache
def path_units() -> list[dict[str, Any]]:
    """The learning path's units in path order (content/units.json)."""
    f = get_settings().content_dir / "units.json"
    if not f.exists():
        return []
    return sorted(json.loads(f.read_text(encoding="utf-8")), key=lambda u: u.get("order", 0))


def learner_topics(live: dict[str, Any], hidden: set[str], lang: str = "ar") -> list[dict]:
    """Approved, link-healthy items of one language (R1), grouped by the path's
    units in path order, then «عام» (R2). The topic list is the same in every
    language, so an empty topic can offer the English items (R2 ex2)."""
    links = unit_links()
    linked = set(links.values())
    topics: dict[str, dict] = {
        u["id"]: {"id": u["id"], "unit": u["id"], "title": u["title"].get(lang) or u["title"].get("ar", u["id"]), "items": []}
        for u in path_units()
        if u["id"] in linked
    }
    general: dict[str, Any] = {"id": GENERAL, "unit": None, "items": []}
    for it in load():
        snap = live.get(it["id"])
        if snap is None or it["id"] in hidden:
            continue
        topics.get(links.get(it["id"], ""), general)["items"].append(snap)
    return [*topics.values(), general]


# --- link health (R1 error) ---------------------------------------------------


async def _alive(client: httpx.AsyncClient, url: str) -> bool:
    try:
        r = await client.head(url, follow_redirects=True)
        if r.status_code == 405:
            r = await client.get(url, headers={"Range": "bytes=0-0"}, follow_redirects=True)
        return r.status_code < 400
    except httpx.HTTPError:
        return False


async def check_library_links(session: AsyncSession, client: httpx.AsyncClient | None = None) -> dict[str, int]:
    """Hide items whose file or page is gone; show them again when back."""
    own = client is None
    client = client or httpx.AsyncClient(timeout=20)
    rows = {r.external_id: r for r in await session.scalars(select(LibraryItem).where(LibraryItem.source_id == "islamhouse"))}
    now = datetime.now(UTC)
    counts = {"ok": 0, "hidden": 0}
    try:
        for it in load():
            urls = [f["url"] for f in it.get("files", [])] or [it["origin_url"]]
            ok = all([await _alive(client, u) for u in urls])
            row = rows.get(it["id"])
            if row is None:
                row = LibraryItem(
                    source_id="islamhouse",
                    external_id=it["id"],
                    type=it["type"],
                    lang=it["lang"],
                    title=it["title"],
                    topic=it["topic"],
                    origin_url=it["origin_url"],
                    file_url=urls[0] if it.get("files") else None,
                )
                session.add(row)
            row.status = "approved" if ok else "hidden"
            row.last_checked_at = now
            counts["ok" if ok else "hidden"] += 1
        await session.commit()
    finally:
        if own:
            await client.aclose()
    return counts


async def scheduled_check() -> None:
    from app.core.db import SessionLocal

    async with SessionLocal() as session:
        counts = await check_library_links(session)
    log.info("library links checked: %s", counts)


# --- fetch candidates ----------------------------------------------------------


def _files(item: dict) -> list[dict]:
    out = []
    for a in item.get("attachments") or []:
        url = a.get("url") or ""
        if urlparse(url).hostname in FILE_HOSTS:
            out.append({"url": url, "ext": (a.get("extension_type") or "").lower(), "size": a.get("size") or ""})
    return out


def to_candidate(raw: dict, topic: str, lang: str) -> dict | None:
    """One API item → one candidate, or None when R5 rules it out."""
    files = _files(raw)
    if raw.get("type") != "articles" and not files:
        return None  # nothing to open on IslamHouse's own hosts (R5)
    authors = [p["title"] for p in raw.get("prepared_by") or [] if p.get("kind") == "author" and p.get("title")]
    return {
        "id": f"ih-{raw['id']}-{lang}",
        "external_id": str(raw["id"]),
        "type": raw["type"],
        "topic": topic,
        "lang": lang,
        "title": raw.get("title", "").strip(),
        "authors": authors,
        "description": (raw.get("description") or "").strip(),
        "origin_url": f"https://islamhouse.com/{lang}/{raw['type']}/{raw['id']}/",
        "files": files,
    }


def fetch() -> dict:
    items: list[dict] = []
    seen: set[str] = set()
    with httpx.Client(timeout=30) as client:
        for topic, cat in TOPICS.items():
            for lang in LANGS:
                page = 1
                while True:
                    url = f"{API}/main/get-category-items/{cat}/showall/{lang}/{lang}/{page}/50/json"
                    data = client.get(url).json()
                    for raw in data.get("data") or []:
                        if raw.get("type") not in TYPES or raw.get("source_language") != lang:
                            continue
                        cand = to_candidate(raw, topic, lang)
                        if cand and cand["id"] not in seen:
                            seen.add(cand["id"])
                            items.append(cand)
                    pages = (data.get("links") or {}).get("pages_number") or 1
                    if page >= pages:
                        break
                    page += 1
    return {
        "note": "KNW-06 library candidates from IslamHouse API v3 (metadata and file links only). "
        "Nothing is shown before the Sharia reviewer approves the item. Rebuild with `python -m app.knowledge.library --fetch`.",
        "fetched": datetime.now(UTC).date().isoformat(),
        "items": items,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--check-links", action="store_true")
    args = ap.parse_args()
    if args.fetch:
        data = fetch()
        f = library_file()
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{len(data['items'])} candidates → {f}")
    if args.check_links:
        asyncio.run(scheduled_check())


if __name__ == "__main__":
    main()
