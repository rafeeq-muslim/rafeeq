"""CMP-05 R8/R9: the team moderates groups (owner decision 2026-10-10:
«There must be a group system for admins to moderate teams between mentors»).

Who: the team role or an admin, as for the report queue (CMP-04 R4); no new
role. They see every group with its mentor's display name, members count and
state; groups that need a mentor come first (R9). They assign or change a
group's mentor, pause or resume it, close it for good, and moderate its
messages with the same hide machinery as a mentor (a hidden message leaves an
actioned report as the record, CMP-04 R4 ex3) or remove a member (no rejoin
by code, CMP-05 R5).

Same-gender rule (rules.md, CMP-01 R3): an assigned mentor is of the group's
gender, and only staff of the group's gender read its chat; the others manage
the group and handle its reports from the queue without reading it. Member
names and the join code are not part of the list (R3: display names inside
the chat only). Every staff opening of a group's chat is recorded once a day
per person and group in the event history (`GroupReadByStaff`, ids only),
like every assignment (`GroupMentorAssigned`) and status change
(`GroupStatusChanged`).
"""

import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import ARRAY, String, cast, func, select

from app.companion import notify
from app.companion.common import langs_of, not_found, now
from app.companion.groups import (
    ACTIVE,
    CLOSED,
    MENTOR_MEMBER_LIMIT,
    NEEDS_MENTOR,
    PAUSED,
    GroupMessageOut,
    _check_member_limit,
    _count,
    may_lead,
    remove,
    state_of,
)
from app.companion.models import Group, GroupMember, GroupMessage, MentorProfile, Report
from app.companion.safety import Team
from app.core.deps import Session
from app.core.events import OutboxEvent, payload_text, publish
from app.platform.models import User

router = APIRouter(prefix="/api/staff/groups", tags=["companion"])
ORDER = {NEEDS_MENTOR: 0, PAUSED: 1, ACTIVE: 2, CLOSED: 3}  # R9: waiting for a mentor first
STAFF_READ_EVERY = timedelta(days=1)
NOT_SAME_GENDER = "not_same_gender"


class StaffGroupOut(BaseModel):
    id: uuid.UUID
    name: str
    lang: str
    gender: str
    capacity: int
    members_count: int
    mentor_id: uuid.UUID
    mentor_name: str
    state: str  # active | needs_mentor | paused | closed
    created_at: datetime
    can_read: bool  # staff of the group's gender only


class CandidateOut(BaseModel):
    id: uuid.UUID
    display_name: str
    places_used: int
    places_left: int


class AssignIn(BaseModel):
    mentor_id: uuid.UUID


class StatusIn(BaseModel):
    status: Literal["active", "paused", "closed"]


async def _row(session, g: Group, me: User) -> StaffGroupOut:
    mentor = await session.get(User, g.mentor_id)
    return StaffGroupOut(
        id=g.id,
        name=g.name,
        lang=g.lang,
        gender=g.gender,
        capacity=g.capacity,
        members_count=await _count(session, g.id),
        mentor_id=g.mentor_id,
        mentor_name=mentor.display_name if mentor else "",
        state=await state_of(session, g, mentor),
        created_at=g.created_at,
        can_read=me.gender == g.gender,
    )


async def _group(session, group_id: uuid.UUID) -> Group:
    g = await session.get(Group, group_id)
    if g is None:
        raise not_found()
    return g


async def _places_used(session, mentor_id: uuid.UUID, besides: uuid.UUID | None = None) -> int:
    q = select(func.coalesce(func.sum(Group.capacity), 0)).where(Group.mentor_id == mentor_id, Group.status != CLOSED)
    if besides is not None:
        q = q.where(Group.id != besides)
    return int(await session.scalar(q) or 0)


async def eligible(session, mentor: User | None, g: Group) -> str | None:
    """Why `mentor` cannot lead `g` now, or None. R8: a mentor in good
    standing (role, rules accepted, not suspended) who takes people
    (not paused), of the group's gender, speaking its language, with room."""
    if mentor is None or not mentor.has("mentor") or not await may_lead(session, mentor):
        return "mentor_not_eligible"
    prof = await session.get(MentorProfile, mentor.id)
    if prof is not None and not prof.accepting:
        return "mentor_not_eligible"
    if mentor.gender != g.gender:
        return "gender_mismatch"
    if g.lang not in langs_of(mentor):
        return "language_not_spoken"
    if await _places_used(session, mentor.id, besides=g.id) + g.capacity > MENTOR_MEMBER_LIMIT:
        return "mentor_member_limit"
    return None


@router.get("", response_model=list[StaffGroupOut])
async def list_groups(session: Session, me: Team) -> list[StaffGroupOut]:
    groups = await session.scalars(select(Group).order_by(Group.created_at.desc()).limit(500))
    rows = [await _row(session, g, me) for g in groups]
    rows.sort(key=lambda r: ORDER.get(r.state, 9))  # stable: newest first within a state
    return rows


@router.get("/{group_id}", response_model=StaffGroupOut)
async def detail(group_id: uuid.UUID, session: Session, me: Team) -> StaffGroupOut:
    return await _row(session, await _group(session, group_id), me)


@router.get("/{group_id}/candidates", response_model=list[CandidateOut])
async def candidates(group_id: uuid.UUID, session: Session, me: Team) -> list[CandidateOut]:
    """Who may take this group: same gender and language first filtered in
    SQL, then the standing and the places checked one by one."""
    g = await _group(session, group_id)
    users = await session.scalars(
        select(User)
        .where(User.roles.op("&&")(cast(["mentor"], ARRAY(String(20)))), User.gender == g.gender, User.id != g.mentor_id)
        .order_by(User.display_name)
        .limit(200)
    )
    out = []
    for u in users:
        if await eligible(session, u, g) is None:
            used = await _places_used(session, u.id)
            out.append(CandidateOut(id=u.id, display_name=u.display_name, places_used=used, places_left=MENTOR_MEMBER_LIMIT - used))
    out.sort(key=lambda c: c.places_used)  # the least loaded first
    return out


@router.put("/{group_id}/mentor", response_model=StaffGroupOut)
async def assign(group_id: uuid.UUID, body: AssignIn, session: Session, me: Team) -> StaffGroupOut:
    g = await _group(session, group_id)
    if g.status == CLOSED:
        raise HTTPException(status.HTTP_409_CONFLICT, "group_closed")
    if body.mentor_id == g.mentor_id and await state_of(session, g) != NEEDS_MENTOR:
        return await _row(session, g, me)
    mentor = await session.get(User, body.mentor_id)
    why = await eligible(session, mentor, g)
    if why == "mentor_member_limit":
        await _check_member_limit(session, body.mentor_id, g.capacity, besides=g.id)  # the same 409 body as R1
    if why is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, why)
    if await session.get(GroupMember, (g.id, body.mentor_id)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "mentor_is_member")
    g.mentor_id = body.mentor_id
    await publish(session, "GroupMentorAssigned", "CMP", {"group_id": str(g.id), "mentor_id": str(body.mentor_id), "user_id": str(me.id)})
    await session.commit()
    members = list(await session.scalars(select(GroupMember.user_id).where(GroupMember.group_id == g.id)))
    notify.later(notify.to_user, body.mentor_id, "notice", f"/inbox/g/{g.id}")
    for uid in members:
        notify.later(notify.to_user, uid, "notice", "/mentor/group")
    return await _row(session, g, me)


@router.put("/{group_id}/status", response_model=StaffGroupOut)
async def set_status(group_id: uuid.UUID, body: StatusIn, session: Session, me: Team) -> StaffGroupOut:
    """R8: pause (nobody posts) and resume; closing is final."""
    g = await _group(session, group_id)
    if g.status == CLOSED:
        raise HTTPException(status.HTTP_409_CONFLICT, "group_closed")
    if g.status != body.status:
        g.status = body.status
        await publish(session, "GroupStatusChanged", "CMP", {"group_id": str(g.id), "status": body.status, "user_id": str(me.id)})
        await session.commit()
    return await _row(session, g, me)


async def _readable(session, group_id: uuid.UUID, me: User) -> Group:
    g = await _group(session, group_id)
    if me.gender != g.gender:
        raise HTTPException(status.HTTP_403_FORBIDDEN, NOT_SAME_GENDER)  # R8: same-gender staff only
    return g


async def _record_read(session, group_id: uuid.UUID, staff_id: uuid.UUID) -> None:
    seen = await session.scalar(
        select(OutboxEvent.id)
        .where(
            OutboxEvent.name == "GroupReadByStaff",
            payload_text("user_id") == str(staff_id),
            payload_text("group_id") == str(group_id),
            OutboxEvent.created_at > now() - STAFF_READ_EVERY,
        )
        .limit(1)
    )
    if seen is None:
        await publish(session, "GroupReadByStaff", "CMP", {"group_id": str(group_id), "user_id": str(staff_id)})
        await session.commit()


@router.get("/{group_id}/messages", response_model=list[GroupMessageOut])
async def messages(group_id: uuid.UUID, session: Session, me: Team) -> list[GroupMessageOut]:
    """The last 200 messages, hidden ones included and marked (the record)."""
    g = await _readable(session, group_id, me)
    await _record_read(session, g.id, me.id)
    rows = await session.execute(
        select(GroupMessage, User.display_name)
        .outerjoin(User, User.id == GroupMessage.author_id)
        .where(GroupMessage.group_id == g.id)
        .order_by(GroupMessage.created_at.desc())
        .limit(200)
    )
    return [
        GroupMessageOut(
            id=m.id,
            author_id=m.author_id,
            author_name=name or "",
            from_mentor=m.author_id == g.mentor_id,
            mine=m.author_id == me.id,
            hidden=m.hidden,
            body=m.body,
            created_at=m.created_at,
        )
        for m, name in reversed(rows.all())
    ]


@router.post("/{group_id}/messages/{message_id}/hide", status_code=204)
async def hide(group_id: uuid.UUID, message_id: uuid.UUID, session: Session, me: Team) -> None:
    """CMP-04 R4: hidden from the members at once; the actioned report is the record."""
    g = await _readable(session, group_id, me)
    m = await session.get(GroupMessage, message_id)
    if m is None or m.group_id != g.id:
        raise not_found()
    m.hidden = True
    session.add(
        Report(
            reporter_id=me.id,
            target_type="group_message",
            target_id=m.id,
            group_id=g.id,
            reason="team_hidden",
            priority="normal",
            status="actioned",
            handled_by=me.id,
        )
    )
    await session.commit()


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(group_id: uuid.UUID, user_id: uuid.UUID, session: Session, me: Team) -> None:
    """CMP-04 R4 ex2 / CMP-05 R5: removed, and no rejoin with the code."""
    g = await _readable(session, group_id, me)
    if not await remove(session, g, user_id, removed=True):
        raise not_found()
    await session.commit()
