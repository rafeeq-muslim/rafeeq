"""CMP-05 small groups.

Only a mentor creates a group, in their own gender and one of their
languages, 10 members by default and at most 15; all of a mentor's groups
together hold at most 25 places, apart from his personal mentees' cap (R1). Joining is by code, with an account, for the
group's gender and language, one group at a time (R2). Members see display
names only (R3). The chat is text, members and mentor only, with reporting,
and refuses contact details (R4). Leaving and removal are silent (R5).
Membership changes are published as GroupJoined / GroupLeft for MOT-06.
"""

import secrets
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from app.companion.common import Lang, not_found, now
from app.companion.models import Block, Group, GroupMember, GroupMessage, Report
from app.companion.text import clean_body
from app.core import ratelimit
from app.core.deps import CurrentUser, Session
from app.core.events import publish
from app.platform.models import User

router = APIRouter(prefix="/api/groups", tags=["companion"])
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L
DEFAULT_CAPACITY = 10
MAX_CAPACITY = 15
MENTOR_MEMBER_LIMIT = 25  # R1: across all of one mentor's groups


async def mentor_only(user: CurrentUser) -> User:
    if not user.has("mentor"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentors_only")
    return user


Mentor = Annotated[User, Depends(mentor_only)]


class GroupIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    lang: Lang
    capacity: int = Field(default=DEFAULT_CAPACITY, ge=2, le=MAX_CAPACITY)


class CapacityIn(BaseModel):
    capacity: int = Field(ge=2, le=MAX_CAPACITY)


class MemberOut(BaseModel):
    id: uuid.UUID
    display_name: str
    is_me: bool


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    lang: str
    gender: str
    capacity: int
    members_count: int
    mentor_name: str
    role: str  # mentor | member
    join_code: str | None = None  # the mentor only
    members: list[MemberOut] = []


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class MessageIn(BaseModel):
    body: str = Field(max_length=4000)


class GroupMessageOut(BaseModel):
    id: uuid.UUID
    author_id: uuid.UUID | None
    author_name: str
    from_mentor: bool
    mine: bool
    hidden: bool  # only ever true on the author's own message (CMP-04 R5)
    body: str
    created_at: datetime


def _code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


async def _count(session, group_id: uuid.UUID) -> int:
    return await session.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group_id)) or 0


async def _out(session, g: Group, me: User, with_members: bool = False) -> GroupOut:
    mentor = await session.get(User, g.mentor_id)
    is_mentor = g.mentor_id == me.id
    out = GroupOut(
        id=g.id,
        name=g.name,
        lang=g.lang,
        gender=g.gender,
        capacity=g.capacity,
        members_count=await _count(session, g.id),
        mentor_name=mentor.display_name if mentor else "",
        role="mentor" if is_mentor else "member",
        join_code=g.join_code if is_mentor else None,
    )
    if with_members:
        rows = await session.execute(
            select(User.id, User.display_name)
            .join(GroupMember, GroupMember.user_id == User.id)
            .where(GroupMember.group_id == g.id)
            .order_by(GroupMember.joined_at)
        )
        out.members = [MemberOut(id=uid, display_name=name, is_me=uid == me.id) for uid, name in rows]  # R3: display names only
    return out


async def access(session, group_id: uuid.UUID, me: User) -> tuple[Group, bool]:
    """The group and whether `me` is its mentor; 404 for anyone outside it."""
    g = await session.get(Group, group_id)
    if g is None:
        raise not_found()
    if g.mentor_id == me.id:
        return g, True
    if await session.get(GroupMember, (group_id, me.id)) is None:
        raise not_found()  # R4 ex2: outsiders see nothing
    return g, False


async def _check_member_limit(session, mentor_id: uuid.UUID, capacity: int, *, besides: uuid.UUID | None = None) -> None:
    """R1 ex3: the places in all of a mentor's groups stay within 25. A group's
    places are its cap, so raising a cap counts like a new group."""
    q = select(func.coalesce(func.sum(Group.capacity), 0)).where(Group.mentor_id == mentor_id)
    if besides is not None:
        q = q.where(Group.id != besides)
    used = await session.scalar(q) or 0
    if used + capacity > MENTOR_MEMBER_LIMIT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"code": "mentor_member_limit", "limit": MENTOR_MEMBER_LIMIT, "remaining": max(0, MENTOR_MEMBER_LIMIT - used)},
        )


async def remove(session, g: Group, user_id: uuid.UUID) -> bool:
    res = await session.execute(delete(GroupMember).where(GroupMember.group_id == g.id, GroupMember.user_id == user_id))
    if res.rowcount:  # type: ignore[attr-defined]
        await publish(session, "GroupLeft", "CMP", {"group_id": str(g.id), "user_id": str(user_id)})
        return True
    return False


@router.post("", status_code=201, response_model=GroupOut)
async def create(body: GroupIn, session: Session, me: Mentor) -> GroupOut:
    if not me.gender:
        raise HTTPException(status.HTTP_409_CONFLICT, "match_profile_required")
    if body.lang not in (me.languages or [me.locale]):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "language_not_spoken")
    clean_body(body.name)
    await _check_member_limit(session, me.id, body.capacity)
    g = Group(
        name=" ".join(body.name.split()), lang=body.lang, gender=me.gender, mentor_id=me.id, capacity=body.capacity, join_code=_code()
    )
    session.add(g)
    await session.flush()
    await publish(session, "GroupCreated", "CMP", {"group_id": str(g.id), "mentor_id": str(me.id)})
    await session.commit()
    return await _out(session, g, me, with_members=True)


@router.get("/mine", response_model=list[GroupOut])
async def mine(session: Session, me: CurrentUser) -> list[GroupOut]:
    led = await session.scalars(select(Group).where(Group.mentor_id == me.id).order_by(Group.created_at.desc()))
    member = await session.scalars(select(Group).join(GroupMember, GroupMember.group_id == Group.id).where(GroupMember.user_id == me.id))
    return [await _out(session, g, me) for g in [*member, *led]]


@router.post("/join", response_model=GroupOut)
async def join(body: JoinIn, session: Session, me: CurrentUser) -> GroupOut:
    ratelimit.hit(f"group-join:{me.id}", 10, 600)
    g = await session.scalar(select(Group).where(Group.join_code == body.code.strip().upper()))
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "code_unknown")
    if g.mentor_id == me.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "already_in_group")
    if not me.gender:
        raise HTTPException(status.HTTP_409_CONFLICT, "match_profile_required")
    if me.gender != g.gender or g.lang not in (me.languages or [me.locale]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "group_not_suitable")  # R2: no details
    current = await session.scalar(select(GroupMember.group_id).where(GroupMember.user_id == me.id).limit(1))
    if current == g.id:
        return await _out(session, g, me, with_members=True)
    if current is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "already_in_group")
    if await _count(session, g.id) >= g.capacity:
        raise HTTPException(status.HTTP_409_CONFLICT, "group_full")
    session.add(GroupMember(group_id=g.id, user_id=me.id, joined_at=now()))
    await session.flush()
    await publish(session, "GroupJoined", "CMP", {"group_id": str(g.id), "user_id": str(me.id)})
    await session.commit()
    return await _out(session, g, me, with_members=True)


@router.get("/{group_id}", response_model=GroupOut)
async def detail(group_id: uuid.UUID, session: Session, me: CurrentUser) -> GroupOut:
    g, _ = await access(session, group_id, me)
    return await _out(session, g, me, with_members=True)


@router.put("/{group_id}/capacity", response_model=GroupOut)
async def set_capacity(group_id: uuid.UUID, body: CapacityIn, session: Session, me: CurrentUser) -> GroupOut:
    """R1: the mentor changes his group's cap, within 15 and his 25 places."""
    g, is_mentor = await access(session, group_id, me)
    if not is_mentor:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentors_only")
    if body.capacity < await _count(session, g.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "below_members")
    await _check_member_limit(session, me.id, body.capacity, besides=g.id)
    g.capacity = body.capacity
    await session.commit()
    return await _out(session, g, me, with_members=True)


@router.post("/{group_id}/leave", status_code=204)
async def leave(group_id: uuid.UUID, session: Session, me: CurrentUser) -> None:
    g, is_mentor = await access(session, group_id, me)
    if is_mentor:
        raise HTTPException(status.HTTP_409_CONFLICT, "mentor_cannot_leave")
    await remove(session, g, me.id)  # R5: silent, no system message
    await session.commit()


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(group_id: uuid.UUID, user_id: uuid.UUID, session: Session, me: CurrentUser) -> None:
    g, is_mentor = await access(session, group_id, me)
    if not is_mentor:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentors_only")
    if not await remove(session, g, user_id):
        raise not_found()
    await session.commit()


async def _messages(session, g: Group, me: User, after: datetime | None) -> list[GroupMessageOut]:
    blocked = set(await session.scalars(select(Block.blocked_id).where(Block.blocker_id == me.id)))
    reported = set(
        await session.scalars(select(Report.target_id).where(Report.reporter_id == me.id, Report.target_type == "group_message"))
    )
    q = select(GroupMessage, User.display_name).outerjoin(User, User.id == GroupMessage.author_id).where(GroupMessage.group_id == g.id)
    if after is not None:
        q = q.where(GroupMessage.created_at > after)
    rows = await session.execute(q.order_by(GroupMessage.created_at.desc()).limit(200))
    out = []
    for m, name in reversed(rows.all()):
        mine = m.author_id == me.id
        if m.author_id in blocked or m.id in reported or (m.hidden and not mine):
            continue
        out.append(
            GroupMessageOut(
                id=m.id,
                author_id=m.author_id,
                author_name=name or "",
                from_mentor=m.author_id == g.mentor_id,
                mine=mine,
                hidden=m.hidden,
                body=m.body,
                created_at=m.created_at,
            )
        )
    return out


@router.get("/{group_id}/messages", response_model=list[GroupMessageOut])
async def messages(group_id: uuid.UUID, session: Session, me: CurrentUser, after: datetime | None = None) -> list[GroupMessageOut]:
    g, _ = await access(session, group_id, me)
    return await _messages(session, g, me, after)


@router.post("/{group_id}/messages", status_code=201, response_model=GroupMessageOut)
async def post(group_id: uuid.UUID, body: MessageIn, session: Session, me: CurrentUser) -> GroupMessageOut:
    g, is_mentor = await access(session, group_id, me)
    ratelimit.hit(f"group-msg:{me.id}", 20, 60)
    text = clean_body(body.body)
    m = GroupMessage(group_id=g.id, author_id=me.id, body=text, created_at=now())
    session.add(m)
    await session.commit()
    return GroupMessageOut(
        id=m.id,
        author_id=me.id,
        author_name=me.display_name,
        from_mentor=is_mentor,
        mine=True,
        hidden=False,
        body=m.body,
        created_at=m.created_at,
    )


@router.post("/{group_id}/messages/{message_id}/hide", status_code=204)
async def hide(group_id: uuid.UUID, message_id: uuid.UUID, session: Session, me: CurrentUser) -> None:
    """CMP-04 R4 ex3: the group's mentor hides at once; the team keeps a record."""
    g, is_mentor = await access(session, group_id, me)
    if not is_mentor:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentors_only")
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
            reason="mentor_hidden",
            priority="normal",
            status="actioned",
            handled_by=me.id,
        )
    )
    await session.commit()
