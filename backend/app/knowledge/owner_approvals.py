"""KNW-05 / KNW-08 R4: approvals the product owner gave outside the review desk.

Product owner's decision (ناصر بن عبدالعزيز العويمر, 2026-10-06): everything
waiting for an internal person's approval is approved. Each file in
`content/approvals/` lists the exact versions it covers (item type, id,
language, content hash). At every start this step records them through the
desk's own tables, so the desk gate (review.approved_ids) is not bypassed:

- one `content_approvals` row (reviewer_id NULL, note = the approver text,
  snapshot = the view) and one `knw_reviews` row (decision approved, same note);
- only when that item and language has no approval and no review decision yet:
  a reviewer's approval or return is never overridden, and a later return
  still wins (review._status);
- only when the listed hash is the item's current hash: an edit made after the
  approval is not silently covered (it stays in review);
- idempotent and safe with several workers: the approval is inserted with
  ON CONFLICT DO NOTHING on its unique key, and only the insert that wins
  writes the decision row.

The approver is recorded honestly: the product owner's blanket approval, not
the Sharia reviewer and not a listening review. Third-party permissions
(licences) are not covered by these files.
"""

import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.events import publish
from app.knowledge import review
from app.knowledge.models import ContentApproval, ContentReview

log = logging.getLogger("rafeeq.knowledge.owner_approvals")


@dataclass(frozen=True)
class Grant:
    item_type: str
    item_id: str
    lang: str
    content_hash: str
    note: str  # who approved, e.g. "product owner blanket approval 2026-10-06 (…)"
    label: str  # how the desk names the approver (no reviewer account)
    decided_at: datetime


def approvals_dir() -> Path:
    return get_settings().content_dir / "approvals"


def load_files() -> list[dict[str, Any]]:
    d = approvals_dir()
    return [json.loads(f.read_text(encoding="utf-8")) for f in sorted(d.glob("*.json"))] if d.is_dir() else []


def grants() -> list[Grant]:
    out = []
    for f in load_files():
        at = datetime.fromisoformat(f["decided_on"]).replace(tzinfo=UTC)
        for i in f["items"]:
            out.append(Grant(i["item_type"], i["item_id"], i["lang"], i["content_hash"], f["approver"], f["label"], at))
    return out


def label_for(note: str | None) -> str | None:
    """The desk's name for an approval recorded without a reviewer account."""
    for f in load_files():
        if note == f["approver"]:
            return f["label"]
    return None


async def apply(session: AsyncSession) -> dict[str, int]:
    """Record every grant not yet decided; returns counts (caller commits)."""
    counts = {"recorded": 0, "already_decided": 0, "stale": 0}
    current: dict[str, dict[str, review.ReviewItem]] = {}
    for g in grants():
        if g.item_type not in current:
            current[g.item_type] = {it.item_id: it for it in review.items(g.item_type)}
        it = current[g.item_type].get(g.item_id)
        if it is None or g.lang not in it.views or it.hash(g.lang) != g.content_hash:
            log.warning("owner approval not applied (item changed or missing): %s/%s/%s", g.item_type, g.item_id, g.lang)
            counts["stale"] += 1
            continue
        decided = await session.scalar(
            select(ContentReview.id)
            .where(ContentReview.item_type == g.item_type, ContentReview.item_id == g.item_id, ContentReview.lang == g.lang)
            .limit(1)
        )
        if decided is not None:
            counts["already_decided"] += 1
            continue
        new_id = await session.scalar(
            insert(ContentApproval)
            .values(
                item_type=g.item_type,
                item_id=g.item_id,
                lang=g.lang,
                status="approved",
                content_hash=g.content_hash,
                snapshot=it.views[g.lang],
                reviewer_id=None,
                decided_at=g.decided_at,
                note=g.note,
            )
            .on_conflict_do_nothing(index_elements=["item_type", "item_id", "lang"])
            .returning(ContentApproval.id)
        )
        if new_id is None:  # an approval exists already (a reviewer's, or another worker's)
            counts["already_decided"] += 1
            continue
        session.add(
            ContentReview(
                item_type=g.item_type,
                item_id=g.item_id,
                lang=g.lang,
                content_hash=g.content_hash,
                decision="approved",
                note=g.note,
                reviewer_id=None,
                decided_at=g.decided_at,
            )
        )
        await session.flush()
        await publish(
            session, "ContentApproved", "KNW", {"item_type": g.item_type, "item_id": g.item_id, "lang": g.lang, "hash": g.content_hash}
        )
        counts["recorded"] += 1
    return counts


async def run() -> dict[str, int]:
    """Own transaction (start-up job)."""
    async with SessionLocal() as session, session.begin():
        out = await apply(session)
    log.info("owner approvals: %s", out)
    return out
