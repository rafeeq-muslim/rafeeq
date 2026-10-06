"""KNW-02 R6: the team's approved cards in the search index.

A lesson card enters `knw_passages` (source `rafeeq_cards`, kind
`approved_card`) in a language only while learners can see it there: the
lesson is merged and not returned in the review desk (rules.md §1.4, KNW-05),
and so is its unit. A card the reviewer returns leaves the index; an edited
card replaces its old text (and loses its vector, so the embedder redoes it).

Refreshed whenever approved content can change:
- `ContentApproved` from the review desk (handler below) and a return
  (review.decide calls `refresh_in`);
- every app start (one-shot job in app.knowledge.jobs), so a deploy with new
  merged content refreshes it;
- `python -m app.knowledge.load` (a full load).

Only the card's own text is stored. A verse-only card (empty text) is not
stored: its verse is already in the index from QuranEnc. The card's verse
and hadith references are kept in `meta`, never their words.
"""

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.core.events import subscribe
from app.knowledge import review
from app.knowledge.load import SOURCES, upsert
from app.knowledge.models import Passage, Source
from app.knowledge.review import fingerprint
from app.knowledge.sources._common import text_hash

log = logging.getLogger("rafeeq.cards")

SOURCE_ID = "rafeeq_cards"
KIND = "approved_card"
LANGS = ("ar", "en", "tl")
LESSON_URL = "/learn/lesson/{}"


def _ensure_registered() -> None:
    # Lessons and units are registered with the review desk by the Learning
    # domain when its module is imported (the API imports it; a CLI may not).
    import app.learning.content  # noqa: F401


async def card_rows(session: AsyncSession) -> list[dict[str, Any]]:
    """One passage per card with text, per language learners can read it in."""
    _ensure_registered()
    unit_of = {it.item_id: it.group for it in review.items("lesson")}
    has_units = bool(review.items("unit"))
    now = datetime.now(UTC)
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for lang in LANGS:
        units = await review.published(session, "unit", lang)
        lessons = await review.published(session, "lesson", lang)
        for lid, view in sorted(lessons.items()):
            if not isinstance(view, dict) or (has_units and unit_of.get(lid) not in units):
                continue  # a lesson in a withdrawn (or missing) unit is not shown
            version = "review:" + fingerprint(view)[:24]
            for card in view.get("cards") or []:
                text = (card.get("text") or "").strip() if isinstance(card.get("text"), str) else ""
                pid = f"{SOURCE_ID}:{lang}:{card.get('id', '')}"
                if not text or not card.get("id") or pid in seen or len(pid) > 96:
                    continue
                seen.add(pid)
                rows.append(
                    {
                        "id": pid,
                        "source_id": SOURCE_ID,
                        "kind": KIND,
                        "lang": lang,
                        "ref": {"lesson_id": lid, "card_id": card["id"]},
                        "ref_key": str(card["id"])[:64],
                        "quote_text": text,
                        "context_text": "",
                        "meta": {
                            "lesson_id": lid,
                            "lesson_title": view.get("title") or "",
                            "unit": unit_of.get(lid, ""),
                            "quran": card.get("quran"),
                            "hadith_ids": card.get("hadith_ids") or [],
                        },
                        "version": version,
                        "origin_url": LESSON_URL.format(lid),
                        "fetched_at": now,
                        "text_hash": text_hash(text),
                    }
                )
    return rows


async def refresh_in(session: AsyncSession) -> dict[str, int]:
    """Make the indexed cards equal to the approved cards, inside the caller's
    transaction (the caller commits)."""
    rows = await card_rows(session)
    meta = SOURCES[SOURCE_ID]
    src = await session.get(Source, SOURCE_ID)
    if src is None:
        src = Source(id=SOURCE_ID, name=meta["name"], url=meta["url"], license=meta["license"], mode="index", versions={})
        session.add(src)
        await session.flush()
    for i in range(0, len(rows), 500):
        await upsert(session, rows[i : i + 500])
    keep = {r["id"] for r in rows}
    existing = set(await session.scalars(select(Passage.id).where(Passage.source_id == SOURCE_ID)))
    gone = list(existing - keep)
    for i in range(0, len(gone), 5000):
        await session.execute(delete(Passage).where(Passage.id.in_(gone[i : i + 5000])))
    versions = {k: v for k, v in (src.versions or {}).items() if k == "embedding"}
    src.versions = {**versions, "count": len(rows), "complete": True, "loaded_at": datetime.now(UTC).isoformat(timespec="seconds")}
    return {"cards": len(rows), "removed": len(gone)}


async def refresh() -> dict[str, int]:
    """Own transaction (start-up job and the loader)."""
    async with SessionLocal() as session, session.begin():
        out = await refresh_in(session)
    log.info("approved cards indexed: %s", out)
    return out


@subscribe("ContentApproved")
async def _on_approved(session: AsyncSession, payload: dict[str, Any]) -> None:
    if payload.get("item_type") in ("lesson", "unit"):
        await refresh_in(session)
