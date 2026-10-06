"""CMP-02 R5 «الإحالة إلى أهل العلم» (`scholar_referral`).

A mentor gives no fatwa. He refers one learner message, a personal Sharia
question, to the Sharia reviewer («أهل العلم» until the product owner names
others; CMP-02 open question). The learner sees at once that scholars will
answer. The reviewer sees the question and its language only: no name, no
guest number, no topic, no other message (rules.md §4: minimum data). The
answer is posted into the same conversation, signed «أهل العلم» by the app,
and announced to the learner with the neutral «لديك رد جديد».
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import case, select

from app.companion import notify
from app.companion.common import not_found, now
from app.companion.inbox import RequestRow, Responder, _row, visible_request
from app.companion.models import HelpMessage, HelpRequest, ScholarReferral
from app.companion.text import clean_body
from app.core import ratelimit
from app.core.deps import CurrentUser, Session
from app.platform.models import User

router = APIRouter(prefix="/api", tags=["companion"])

# The learner's thread shows this system message in their language (frontend `cmp.referral.notice`).
REFERRAL_NOTICE = "scholar_referral"


class ReferIn(BaseModel):
    message_id: uuid.UUID


@router.post("/inbox/requests/{request_id}/refer", status_code=201, response_model=RequestRow)
async def refer(request_id: uuid.UUID, body: ReferIn, session: Session, me: Responder) -> RequestRow:
    req = await visible_request(session, me, request_id)
    msg = await session.get(HelpMessage, body.message_id)
    if msg is None or msg.request_id != req.id or msg.author != "learner" or msg.hidden:
        raise not_found()
    if await session.scalar(select(ScholarReferral.id).where(ScholarReferral.message_id == msg.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "already_referred")
    t = now()
    session.add(ScholarReferral(request_id=req.id, message_id=msg.id, lang=req.lang, status="open", referred_by=me.id, created_at=t))
    session.add(HelpMessage(request_id=req.id, author="system", body=REFERRAL_NOTICE, created_at=t))
    req.last_activity_at = t
    await session.commit()
    notify.later(notify.to_role, ["sharia_reviewer"], "referral", "/referrals")
    return await _row(session, req, me)


# --- the Sharia reviewer's side -------------------------------------------------


async def reviewer_only(user: CurrentUser) -> User:
    if not user.has("sharia_reviewer"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "reviewer_only")
    return user


Reviewer = Annotated[User, Depends(reviewer_only)]


class ReferralOut(BaseModel):
    id: uuid.UUID
    lang: str
    question: str
    status: Literal["open", "answered"]
    created_at: datetime
    answer: str | None = None
    answered_at: datetime | None = None


async def _out(session, r: ScholarReferral) -> ReferralOut:
    question = await session.scalar(select(HelpMessage.body).where(HelpMessage.id == r.message_id))
    answer = await session.scalar(select(HelpMessage.body).where(HelpMessage.id == r.answer_id)) if r.answer_id else None
    return ReferralOut(
        id=r.id,
        lang=r.lang,
        question=question or "",
        status=r.status,  # type: ignore[arg-type]
        created_at=r.created_at,
        answer=answer,
        answered_at=r.answered_at,
    )


@router.get("/referrals", response_model=list[ReferralOut])
async def referrals(session: Session, me: Reviewer) -> list[ReferralOut]:
    """Open first, oldest first; then the last answered ones."""
    rows = await session.scalars(
        select(ScholarReferral).order_by(case((ScholarReferral.status == "open", 0), else_=1), ScholarReferral.created_at).limit(100)
    )
    return [await _out(session, r) for r in rows]


class AnswerIn(BaseModel):
    body: str = Field(max_length=4000)


@router.post("/referrals/{referral_id}/answer", response_model=ReferralOut)
async def answer(referral_id: uuid.UUID, body: AnswerIn, session: Session, me: Reviewer) -> ReferralOut:
    r = await session.get(ScholarReferral, referral_id)
    if r is None:
        raise not_found()
    if r.status == "answered":
        raise HTTPException(status.HTTP_409_CONFLICT, "already_answered")
    ratelimit.hit(f"referral-answer:{me.id}", 30, 60)
    text = clean_body(body.body)
    req = await session.get(HelpRequest, r.request_id)
    if req is None:
        raise not_found()
    t = now()
    msg = HelpMessage(request_id=req.id, author="scholar", author_id=me.id, body=text, created_at=t)
    session.add(msg)
    await session.flush()
    r.status, r.answered_by, r.answered_at, r.answer_id = "answered", me.id, t, msg.id
    req.status = "answered"
    req.last_activity_at = t
    await session.commit()
    url = f"/mentor/help/{req.id}"
    if req.learner_id is not None:
        notify.later(notify.to_user, req.learner_id, "reply", url)
    elif req.push_endpoint:
        notify.later(notify.to_endpoint, req.push_endpoint, "reply", req.lang, url)
    return await _out(session, r)
