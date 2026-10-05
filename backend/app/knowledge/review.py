"""KNW-05: Sharia review of team-written content.

Other domains register the items they want reviewed (lessons, units, media,
daily cards, adhkar...). Each item offers, per language, the exact view a
learner would see. The reviewer approves or returns one language at a time
(R6); approval stores that view as the published snapshot (R3), so learners
keep the last approved text while an edit waits for review.

The status of the *current* version of an item in one language is:
  approved   the current text is the published snapshot
  returned   the reviewer returned this exact version, with a reason (R4)
  in_review  anything else (new, or edited since the last decision)
"""

import hashlib
import json
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import Session, require_role
from app.core.events import publish
from app.knowledge.models import ContentApproval, ContentReview
from app.platform.models import User

LANGS = ("ar", "en", "tl")


def fingerprint(view: Any) -> str:
    return hashlib.sha256(json.dumps(view, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


@dataclass
class ReviewItem:
    item_type: str
    item_id: str
    order: tuple = ()
    group: str = ""  # e.g. the unit a lesson belongs to, for the desk's grouping
    views: dict[str, Any] = field(default_factory=dict)  # lang -> learner view (only languages that exist)

    def hash(self, lang: str) -> str:
        return fingerprint(self.views[lang])


Provider = Callable[[], Iterable[ReviewItem]]
_providers: dict[str, Provider] = {}


def register(item_type: str, provider: Provider) -> None:
    _providers[item_type] = provider


def items(item_type: str | None = None) -> list[ReviewItem]:
    out: list[ReviewItem] = []
    for t, provider in _providers.items():
        if item_type in (None, t):
            out.extend(provider())
    return out


def find(item_type: str, item_id: str) -> ReviewItem:
    for it in items(item_type):
        if it.item_id == item_id:
            return it
    raise HTTPException(status.HTTP_404_NOT_FOUND, "item_not_found")


async def published(session: AsyncSession, item_type: str, lang: str) -> dict[str, Any]:
    """item_id -> approved snapshot, for what learners see."""
    rows = await session.scalars(select(ContentApproval).where(ContentApproval.item_type == item_type, ContentApproval.lang == lang))
    return {r.item_id: r.snapshot for r in rows}


async def _latest_decisions(session: AsyncSession, item_type: str | None = None) -> dict[tuple[str, str, str], ContentReview]:
    q = select(ContentReview).order_by(ContentReview.decided_at)
    if item_type:
        q = q.where(ContentReview.item_type == item_type)
    return {(r.item_type, r.item_id, r.lang): r for r in await session.scalars(q)}


def _status(item: ReviewItem, lang: str, approval: ContentApproval | None, last: ContentReview | None) -> str:
    h = item.hash(lang)
    if approval is not None and approval.content_hash == h:
        return "approved"
    if last is not None and last.decision == "returned" and last.content_hash == h:
        return "returned"
    return "in_review"


router = APIRouter(prefix="/api/review", tags=["review"])
Desk = Annotated[User, Depends(require_role("sharia_reviewer", "team"))]


@router.get("/queue")
async def queue(session: Session, _: Desk, item_type: str | None = None) -> dict:
    approvals = {(a.item_type, a.item_id, a.lang): a for a in await session.scalars(select(ContentApproval))}
    decisions = await _latest_decisions(session, item_type)
    rows = []
    for it in sorted(items(item_type), key=lambda i: (i.item_type, i.order, i.item_id)):
        langs = {}
        for lg in LANGS:
            if lg not in it.views:
                continue
            key = (it.item_type, it.item_id, lg)
            st = _status(it, lg, approvals.get(key), decisions.get(key))
            langs[lg] = {"status": st, "live": key in approvals, "note": decisions[key].note if st == "returned" else None}
        rows.append({"item_type": it.item_type, "item_id": it.item_id, "group": it.group, "title": _title(it), "langs": langs})
    counts = {s: sum(1 for r in rows for v in r["langs"].values() if v["status"] == s) for s in ("in_review", "returned", "approved")}
    return {"items": rows, "counts": counts}


def _title(it: ReviewItem) -> dict[str, str]:
    return {lg: v.get("title", "") if isinstance(v, dict) else "" for lg, v in it.views.items()}


@router.get("/items/{item_type}/{item_id}")
async def item_detail(item_type: str, item_id: str, session: Session, _: Desk) -> dict:
    it = find(item_type, item_id)
    approvals = {
        a.lang: a
        for a in await session.scalars(
            select(ContentApproval).where(ContentApproval.item_type == item_type, ContentApproval.item_id == item_id)
        )
    }
    history = list(
        await session.scalars(
            select(ContentReview)
            .where(ContentReview.item_type == item_type, ContentReview.item_id == item_id)
            .order_by(ContentReview.decided_at.desc())
        )
    )
    reviewers = {
        u.id: u.display_name
        for u in await session.scalars(select(User).where(User.id.in_({h.reviewer_id for h in history if h.reviewer_id})))
    }
    out: dict[str, Any] = {}
    for lg, view in it.views.items():
        a = approvals.get(lg)
        last = next((h for h in history if h.lang == lg), None)
        out[lg] = {
            "status": _status(it, lg, a, last),
            "hash": it.hash(lg),
            "current": view,
            "live": a.snapshot if a and a.content_hash != it.hash(lg) else None,  # shown as "what learners see now"
        }
    return {
        "item_type": item_type,
        "item_id": item_id,
        "group": it.group,
        "langs": out,
        "history": [
            {
                "lang": h.lang,
                "decision": h.decision,
                "note": h.note,
                "reviewer": reviewers.get(h.reviewer_id) if h.reviewer_id else None,
                "at": h.decided_at,
                "hash": h.content_hash,
            }
            for h in history
        ],
    }


class Decision(BaseModel):
    decision: Literal["approved", "returned"]
    hash: str = Field(min_length=64, max_length=64, description="the version the reviewer read")
    note: str | None = Field(default=None, max_length=2000)


@router.post("/items/{item_type}/{item_id}/{lang}")
async def decide(item_type: str, item_id: str, lang: str, body: Decision, session: Session, user: Desk) -> dict:
    # R5: only the Sharia reviewer decides; team members (and admins) can read the desk.
    if not user.has("sharia_reviewer"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "reviewer_only")
    it = find(item_type, item_id)
    if lang not in it.views:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "language_not_found")
    current = it.hash(lang)
    if body.hash != current:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "changed_since_opened", "hash": current})
    note = (body.note or "").strip() or None
    if body.decision == "returned" and not note:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "reason_required")  # R4

    now = datetime.now(UTC)
    session.add(
        ContentReview(
            item_type=item_type, item_id=item_id, lang=lang, content_hash=current, decision=body.decision, note=note, reviewer_id=user.id
        )
    )
    if body.decision == "approved":
        a = await session.scalar(
            select(ContentApproval).where(
                ContentApproval.item_type == item_type, ContentApproval.item_id == item_id, ContentApproval.lang == lang
            )
        )
        if a is None:
            a = ContentApproval(item_type=item_type, item_id=item_id, lang=lang)
            session.add(a)
        a.status, a.content_hash, a.snapshot, a.reviewer_id, a.decided_at, a.note = "approved", current, it.views[lang], user.id, now, note
        await session.flush()
        await publish(session, "ContentApproved", "KNW", {"item_type": item_type, "item_id": item_id, "lang": lang, "hash": current})
    await session.commit()
    return {"status": body.decision}
