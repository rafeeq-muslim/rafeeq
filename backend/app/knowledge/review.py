"""KNW-05: Sharia review of team-written content.

Other domains register the items they want reviewed (lessons, units, media,
daily cards, adhkar...). Each item offers, per language, the exact view a
learner would see.

Product owner's decision (2026-10-06, rules.md §1.4): the Sharia reviewer
reviews content *before it is merged* into the repository, so merged content
is shown to learners directly. The desk stays for later corrections: the
reviewer can confirm a version (approve, recorded with its hash) or return
it with a reason, which withdraws that exact version in that language until
it is corrected (a new version shows again).

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
from app.knowledge.models import ContentApproval, ContentReview, Passage
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
    # KNW-08 R4: content a feature decision keeps from learners until the reviewer approves it
    # (e.g. a new reciter, approved on a sample of surahs); see approved_ids().
    gated: bool = False

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
    """item_id -> what learners see in `lang`: the merged text, except a
    version the reviewer returned (withdrawn until corrected). Gated items are
    left out: they wait for approval (approved_ids)."""
    decisions = await _latest_decisions(session, item_type)
    out: dict[str, Any] = {}
    for it in items(item_type):
        if lang not in it.views or it.gated:
            continue
        last = decisions.get((item_type, it.item_id, lang))
        if last is not None and last.decision == "returned" and last.content_hash == it.hash(lang):
            continue
        out[it.item_id] = it.views[lang]
    return out


async def _latest_decisions(session: AsyncSession, item_type: str | None = None) -> dict[tuple[str, str, str], ContentReview]:
    q = select(ContentReview).order_by(ContentReview.decided_at)
    if item_type:
        q = q.where(ContentReview.item_type == item_type)
    return {(r.item_type, r.item_id, r.lang): r for r in await session.scalars(q)}


def _status(item: ReviewItem, lang: str, approval: ContentApproval | None, last: ContentReview | None) -> str:
    h = item.hash(lang)
    # The newest decision wins: a version approved and then returned is returned.
    if last is not None and last.decision == "returned" and last.content_hash == h:
        return "returned"
    if approval is not None and approval.content_hash == h:
        return "approved"
    return "in_review"


async def approved_ids(session: AsyncSession, item_type: str, lang: str) -> set[str]:
    """Items whose current version in `lang` the reviewer approved (and did not
    return since). For gated content, which waits for approval (KNW-08 R4)."""
    approvals = {
        a.item_id: a
        for a in await session.scalars(select(ContentApproval).where(ContentApproval.item_type == item_type, ContentApproval.lang == lang))
    }
    decisions = await _latest_decisions(session, item_type)
    return {
        it.item_id
        for it in items(item_type)
        if lang in it.views and _status(it, lang, approvals.get(it.item_id), decisions.get((item_type, it.item_id, lang))) == "approved"
    }


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
            # live: learners see it (merged content is shown unless this version was returned;
            # gated content only once approved)
            live = st == "approved" if it.gated else st != "returned"
            langs[lg] = {"status": st, "live": live, "note": decisions[key].note if st == "returned" else None}
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
            "live": None,  # since 2026-10-06 learners see the merged text itself (rules.md §1.4)
            # KNW-05 R2: each cited hadith from its stored record (null: not loaded)
            "hadith": await _hadith_citations(session, view, lg),
            # KNW-03 R3 ex2: glossary concepts written with a non-approved spelling
            "glossary_flags": _glossary.spelling_flags(_texts(view), lg),
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
                # an approval recorded without a reviewer account (owner_approvals.py) names its approver
                "reviewer": reviewers.get(h.reviewer_id) if h.reviewer_id else _owner_approvals.label_for(h.note),
                "at": h.decided_at,
                "hash": h.content_hash,
            }
            for h in history
        ],
    }


def _texts(view: Any) -> str:
    """Every string of a learner view, for the glossary spelling check."""
    if isinstance(view, str):
        return view
    if isinstance(view, dict):
        return "\n".join(_texts(v) for k, v in view.items() if k not in ("id", "kind", "image_url", "audio"))
    if isinstance(view, list):
        return "\n".join(_texts(v) for v in view)
    return ""


async def _hadith_citations(session: AsyncSession, view: Any, lang: str) -> dict[str, Any]:
    """KNW-05 R2: {hadith id: stored text, grade, reference, url | None} for
    every `hadith_ids` entry of the view's cards, in the view's language."""
    ids = sorted({int(h) for c in (view.get("cards") or [] if isinstance(view, dict) else []) for h in c.get("hadith_ids") or []})
    if not ids:
        return {}
    rows = {
        p.ref_key: p
        for p in await session.scalars(
            select(Passage).where(
                Passage.source_id == "hadeethenc",
                Passage.kind == "hadith",
                Passage.lang == lang,
                Passage.ref_key.in_([str(i) for i in ids]),
            )
        )
    }
    out: dict[str, Any] = {}
    for i in ids:
        p = rows.get(str(i))
        meta = (p.meta or {}) if p else {}
        out[str(i)] = (
            {
                "text": p.quote_text,
                "grade": meta.get("grade") or None,
                "attribution": meta.get("attribution") or None,
                "reference": meta.get("reference") or None,
                "url": p.origin_url,
                "version": p.version,
            }
            if p
            else None
        )
    return out


@router.get("/glossary/missing")
async def glossary_missing(session: Session, _: Desk) -> dict:
    """KNW-03 R5: concepts recorded with no approved term in a language."""
    return {"items": await _glossary.missing_terms(session)}


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
    elif item_type in ("lesson", "unit"):
        # KNW-02 R6: a returned version is withdrawn, so its cards leave the search index.
        await _cards.refresh_in(session)
    await session.commit()
    return {"status": body.decision}


# Imported last: both modules register with (and read) this desk.
# KNW-02 R6: approved cards follow the desk (subscribes to ContentApproved).
from app.knowledge import cards as _cards  # noqa: E402
from app.knowledge import glossary as _glossary  # noqa: E402
from app.knowledge import owner_approvals as _owner_approvals  # noqa: E402
