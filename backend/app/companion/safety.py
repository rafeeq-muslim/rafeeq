"""CMP-04 report and block.

One-tap report with a reason on any group message, on a message from the
person answering a help request or from one's mentor, and, for that person,
on the learner's message in the same conversation (R1). Marriage, money
and recruitment («الأسباب الخطرة») hide the message for everyone at once
until the team reviews it; other reasons hide it for the reporter only (R2).
«خطر على أحد» goes to the top of the team's queue and alerts the team at
once with a neutral push (R3); dangerous reports alert the team too (open
question default). The team reviews «خطر على أحد» first, then dangerous,
then the oldest, and keeps it hidden, restores it or removes the author from
the group (R4). Nobody learns who reported or who blocked them (R5). Blocks:
a group member, one's mentor (mentors.py) or the person answering a request
(help.py) (R6).
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, delete, select

from app.companion import notify
from app.companion.common import CurrentOwner, is_team, not_found
from app.companion.groups import access, remove
from app.companion.inbox import visible_request
from app.companion.models import Block, Group, GroupMessage, HelpMessage, HelpRequest, Report
from app.core import ratelimit
from app.core.deps import CurrentUser, Session
from app.platform.models import User

router = APIRouter(prefix="/api", tags=["companion"])
DANGEROUS = {"marriage", "money", "recruitment"}  # hidden for everyone (R2)
DANGER_TO_SOMEONE = "danger"  # «خطر على أحد»: top of the queue, team alerted (R3)

Reason = Literal["marriage", "money", "recruitment", "danger", "abuse", "other"]


class ReportIn(BaseModel):
    target_type: Literal["group_message", "help_message"]
    target_id: uuid.UUID
    reason: Reason
    note: str | None = Field(default=None, max_length=500)


@router.post("/reports", status_code=201)
async def report(body: ReportIn, session: Session, owner: CurrentOwner) -> dict:
    if owner.anonymous:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign_in_required")
    ratelimit.hit(f"report:{owner.user.id if owner.user else owner.token_hash}", 20, 3600)
    group_id = None
    if body.target_type == "group_message":
        if owner.user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign_in_required")
        msg = await session.get(GroupMessage, body.target_id)
        if msg is None:
            raise not_found()
        await access(session, msg.group_id, owner.user)  # must be able to see it
        if msg.author_id == owner.user.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot_report_self")
        group_id = msg.group_id
    else:
        hm = await session.get(HelpMessage, body.target_id)
        req = await session.get(HelpRequest, hm.request_id) if hm else None
        if hm is None or req is None:
            raise not_found()
        learner_reports_reply = owner.owns(req) and hm.author in ("mentor", "scholar")
        # R1: the person answering a request (or a mentor in his mentee's
        # thread) reports the learner's message, with the same reasons and queue.
        responder_reports_learner = owner.user is not None and hm.author == "learner" and await _answers(session, owner.user, req)
        if not (learner_reports_reply or responder_reports_learner):
            raise not_found()
        msg = hm
    high = body.reason in DANGEROUS
    priority = "danger" if body.reason == DANGER_TO_SOMEONE else "high" if high else "normal"
    session.add(
        Report(
            reporter_id=owner.user.id if owner.user else None,
            reporter_guest_hash=None if owner.user else owner.token_hash,
            target_type=body.target_type,
            target_id=body.target_id,
            group_id=group_id,
            reason=body.reason,
            priority=priority,
            note=(body.note or "").strip() or None,
        )
    )
    if high:
        msg.hidden = True  # R2: hidden for everyone until the team reviews it
    await session.commit()
    if priority != "normal":
        notify.later(notify.to_role, ["team", "admin"], "report_danger" if priority == "danger" else "report", "/inbox?tab=reports")
    return {"ok": True, "hidden_for_all": high}


async def _answers(session, user: User, req: HelpRequest) -> bool:
    """Whether `user` is a responder who can open this request in his inbox."""
    if not (user.has("mentor") or is_team(user)):
        return False
    try:
        await visible_request(session, user, req.id)
    except HTTPException:
        return False
    return True


# --- team queue (R3, R4) -------------------------------------------------


async def team_only(user: CurrentUser) -> User:
    if not (user.has("team") or user.has("admin")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "team_only")
    return user


Team = Annotated[User, Depends(team_only)]


class QueueItem(BaseModel):
    id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    reason: str
    priority: str
    note: str | None
    status: str
    created_at: datetime
    body: str | None
    author_name: str | None
    author_id: uuid.UUID | None
    hidden: bool
    place: str | None  # group name, or "help"
    group_id: uuid.UUID | None


@router.get("/team/reports", response_model=list[QueueItem])
async def queue(session: Session, team: Team, include_closed: bool = False) -> list[QueueItem]:
    q = select(Report)
    if not include_closed:
        q = q.where(Report.status == "open")
    q = q.order_by(case((Report.priority == "danger", 0), (Report.priority == "high", 1), else_=2), Report.created_at).limit(200)
    out = []
    for r in await session.scalars(q):
        body = author_name = place = None
        author_id = None
        hidden = False
        if r.target_type == "group_message":
            m = await session.get(GroupMessage, r.target_id)
            if m is not None:
                body, author_id, hidden = m.body, m.author_id, m.hidden
                g = await session.get(Group, m.group_id)
                place = g.name if g else None
        else:
            hm = await session.get(HelpMessage, r.target_id)
            if hm is not None:
                body, author_id, hidden, place = hm.body, hm.author_id, hm.hidden, "help"
        if author_id is not None:
            u = await session.get(User, author_id)
            author_name = u.display_name if u else None
        out.append(
            QueueItem(
                id=r.id,
                target_type=r.target_type,
                target_id=r.target_id,
                reason=r.reason,
                priority=r.priority,
                note=r.note,
                status=r.status,
                created_at=r.created_at,
                body=body,
                author_name=author_name,
                author_id=author_id,
                hidden=hidden,
                place=place,
                group_id=r.group_id,
            )
        )
    return out


class ActionIn(BaseModel):
    action: Literal["keep_hidden", "restore", "remove_member"]


@router.post("/team/reports/{report_id}", response_model=QueueItem)
async def act(report_id: uuid.UUID, body: ActionIn, session: Session, team: Team) -> QueueItem:
    r = await session.get(Report, report_id)
    if r is None:
        raise not_found()
    msg = await session.get(GroupMessage if r.target_type == "group_message" else HelpMessage, r.target_id)
    if body.action == "restore":
        if msg is not None:
            msg.hidden = False
        r.status = "dismissed"
    else:
        if msg is not None:
            msg.hidden = True
        r.status = "actioned"
        if body.action == "remove_member":
            if r.target_type != "group_message" or msg is None or msg.author_id is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "not_a_group_message")
            g = await session.get(Group, msg.group_id)
            if g is not None:
                await remove(session, g, msg.author_id)
    r.handled_by = team.id
    # Other open reports on the same message are settled by the same decision.
    for other in await session.scalars(
        select(Report).where(and_(Report.target_id == r.target_id, Report.status == "open", Report.id != r.id))
    ):
        other.status, other.handled_by = r.status, team.id
    await session.commit()
    items = [i for i in await queue(session, team, include_closed=True) if i.id == r.id]
    return items[0]


# --- blocks (R6) -----------------------------------------------------------


class BlockIn(BaseModel):
    user_id: uuid.UUID


@router.post("/blocks", status_code=204)
async def block(body: BlockIn, session: Session, user: CurrentUser) -> None:
    if body.user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot_block_self")
    if await session.get(User, body.user_id) is None:
        raise not_found()
    if not await session.scalar(select(Block.id).where(Block.blocker_id == user.id, Block.blocked_id == body.user_id)):
        session.add(Block(blocker_id=user.id, blocked_id=body.user_id))
    await session.commit()


@router.delete("/blocks/{user_id}", status_code=204)
async def unblock(user_id: uuid.UUID, session: Session, user: CurrentUser) -> None:
    await session.execute(delete(Block).where(Block.blocker_id == user.id, Block.blocked_id == user_id))
    await session.commit()
