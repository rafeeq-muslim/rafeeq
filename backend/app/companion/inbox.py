"""CMP-02 mentor inbox.

A responder (mentor, or team member with a gender) sees ordinary requests in
their languages whose requester is of their own gender, and every urgent
request nobody holds yet, whatever its language: in danger the first
available person answers (R1, README, rules.md §2.8). Urgent first, then the
longest wait (R2). The first reply claims a request; a learner's own mentor
gets it first and the pool sees it after a day without a reply (R3).

Security review B-M3: once someone holds an urgent request (the first reply
claims it) only that responder and the team see it, answer it or close it;
it returns to everyone if it loses its holder (blocked or suspended).
Closing any request is for its assignee or the team. Turning a conversation
a responder already holds into an urgent one (a private mentor thread, or a
request he answered) keeps it with him and shows it to the team, with a
neutral push to the team only: the private words never reach every mentor.
An unanswered request made urgent loses its holder and reaches everyone. The mentor writes when he is available,
caps his personal mentees (8 by default, at most 10) and can pause: paused,
he is not suggested to new learners and takes no new requests from the pool
(R4). He gives no fatwa: he refers a personal Sharia question to the Sharia
reviewer (`referrals.py`) and turns danger into an urgent request (R5). A
request shows a display name or guest number, language, topic and source
only; a mentee's status only while they share progress (R6, MOT-07 R6).

R8 (owner decision 2026-10-10, «All of it of course»): a private mentor
thread turned urgent keeps its kind and gets `escalated_at`, so the learner
and the mentor stay in ONE thread and the team reads all of it, from the
first message, including what a report hid (marked), until a team member
ends the escalation. Nobody else sees it: not other mentors, not the Sharia
reviewer, not a coordinator, and not the pool after the mentor leaves. Each
staff opening is recorded once a day per person and thread in the event
history (`EscalatedThreadRead {request_id, user_id}`, no text).
"""

import uuid
from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, exists, func, not_, or_, select, update
from sqlalchemy.orm import aliased

from app.companion import notify
from app.companion.common import THREAD_MSGS_PER_DAY, blocked_by_owner_clause, is_paused, is_team, langs_of, message_page, not_found, now
from app.companion.contact import mentor_contacted
from app.companion.models import HelpMessage, HelpRequest, MenteeStatus, MentorLink, MentorProfile, Report, ScholarReferral
from app.companion.text import clean_body_async
from app.core import ratelimit
from app.core.deps import CurrentUser, Session
from app.core.events import OutboxEvent, payload_text, publish
from app.platform.models import User

router = APIRouter(prefix="/api/inbox", tags=["companion"])
OWN_MENTOR_FIRST = timedelta(hours=24)
ALERT_LIFETIME = timedelta(hours=24)


async def mentor_gate(session, user: User) -> None:
    """ORG-02 R2 and R5: a mentor reads and accepts the mentor rules before
    the inbox opens, and a suspended mentor has no inbox. Team members are
    staff, not volunteers, and have no gate."""
    if is_team(user) or not user.has("mentor"):
        return
    prof = await session.get(MentorProfile, user.id)
    if prof is not None and prof.suspended:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentor_suspended")
    if prof is None or prof.rules_accepted_at is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentor_rules_required")


async def responder(user: CurrentUser, session: Session) -> User:
    if not (user.has("mentor") or is_team(user)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentors_only")  # R6 ex3
    await mentor_gate(session, user)
    return user


async def mentor_only(user: CurrentUser, session: Session) -> User:
    if not user.has("mentor"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentors_only")
    await mentor_gate(session, user)
    return user


Responder = Annotated[User, Depends(responder)]
Mentor = Annotated[User, Depends(mentor_only)]


def _live_link(mentor_id: uuid.UUID):
    return exists().where(MentorLink.learner_id == HelpRequest.learner_id, MentorLink.mentor_id == mentor_id)


def former_mentor_clause(mentor_id: uuid.UUID):
    """CMP-03 R4: this mentor was the requester's mentor and the link ended
    (changed, ended, blocked, suspended or approval withdrawn). Their private
    thread, kept closed for the learner, is the record (`mentors.end_link`)."""
    pair = aliased(HelpRequest)
    return and_(
        exists().where(pair.kind == "mentor", pair.learner_id == HelpRequest.learner_id, pair.mentor_id == mentor_id),
        not_(_live_link(mentor_id)),
    )


def assigned_clause(mentor_id: uuid.UUID):
    """Requests held by this mentor that are not closed. A private mentor
    thread counts only while the learner's link with him lives (CMP-03 R4):
    after the link ends he never sees that thread or the learner's new
    words again, even if the thread were reopened."""
    return and_(
        HelpRequest.mentor_id == mentor_id,
        HelpRequest.status != "closed",
        or_(HelpRequest.kind != "mentor", _live_link(mentor_id)),
    )


def escalated_clause():
    """R8: a private mentor thread its mentor turned urgent (CMP-02 R5 ex3)."""
    return and_(HelpRequest.kind == "mentor", HelpRequest.escalated_at.is_not(None))


def visible_clause(user: User, t: datetime, *, paused: bool = False):
    has_owner = or_(HelpRequest.learner_id.is_not(None), HelpRequest.guest_token_hash.is_not(None))
    urgent = and_(
        HelpRequest.kind == "urgent",
        HelpRequest.status != "closed",
        or_(has_owner, HelpRequest.created_at > t - ALERT_LIFETIME),  # unopened alerts fade after 24 h
    )
    if not is_team(user):
        # B-M3: held by someone = his (assigned_clause below) and the team's.
        urgent = and_(urgent, HelpRequest.mentor_id.is_(None))
    conds = [urgent]
    if is_team(user):
        conds.append(escalated_clause())  # R8: the team reads an escalated private thread, whatever its state
    if user.gender and not paused and (user.has("mentor") or is_team(user)):
        matches = and_(
            HelpRequest.lang.in_(langs_of(user)),
            # R1, CMP-01 R3: same gender only. Null = a request from before the rule.
            or_(HelpRequest.requester_gender.is_(None), HelpRequest.requester_gender == user.gender),
        )
        conds.append(
            and_(
                HelpRequest.kind.in_(("human", "escalation")),
                HelpRequest.status != "closed",
                matches,
                or_(
                    HelpRequest.mentor_id.is_(None),
                    and_(HelpRequest.first_reply_at.is_(None), HelpRequest.created_at < t - OWN_MENTOR_FIRST),
                ),
                # CMP-03 R4: a former mentor never sees the learner's new words
                # in the pool either. Urgent requests above keep danger routing.
                not_(former_mentor_clause(user.id)),
            )
        )
    conds.append(assigned_clause(user.id))  # claimed, or own mentee
    return and_(or_(*conds), not_(blocked_by_owner_clause(user.id)))


class RequestRow(BaseModel):
    id: uuid.UUID
    handle: str
    is_guest: bool
    lang: str
    kind: str
    topic: str | None
    source: str | None
    status: str
    preview: str | None
    unread: int
    created_at: datetime
    last_activity_at: datetime
    assigned_to_me: bool
    can_reply: bool
    can_close: bool = False  # B-M3: the assignee or the team
    escalated: bool = False  # R8: a private mentor thread its mentor turned urgent (the team reads all of it)


class ThreadMessage(BaseModel):
    id: uuid.UUID
    author: Literal["learner", "mentor", "scholar", "system"]
    name: str | None
    mine: bool
    body: str
    created_at: datetime
    hidden: bool = False  # only ever true on the responder's own message (CMP-04 R5)


class InboxThread(RequestRow):
    messages: list[ThreadMessage]
    referred: list[uuid.UUID] = []  # learner messages already referred to the Sharia reviewer (R5)
    # Only the last 200 messages come at once; `?before=<id of the first one>` reads the page before them.
    has_earlier: bool = False


async def _row(session, req: HelpRequest, me: User) -> RequestRow:
    unread = await session.scalar(
        select(func.count())
        .select_from(HelpMessage)
        .where(HelpMessage.request_id == req.id, HelpMessage.author == "learner", HelpMessage.read_at.is_(None))
    )
    preview = await session.scalar(
        select(HelpMessage.body)
        .where(HelpMessage.request_id == req.id, HelpMessage.author == "learner", HelpMessage.hidden.is_(False))
        .order_by(HelpMessage.created_at.desc())
        .limit(1)
    )
    owned = req.learner_id is not None or req.guest_token_hash is not None
    return RequestRow(
        id=req.id,
        handle=req.handle,
        is_guest=req.learner_id is None,
        lang=req.lang,
        kind="urgent" if req.escalated_at is not None else req.kind,  # R8: shown as urgent, still one private thread
        topic=req.topic,
        source=req.source,
        status=req.status,
        preview=preview[:140] if preview else None,
        unread=unread or 0,
        created_at=req.created_at,
        last_activity_at=req.last_activity_at,
        assigned_to_me=req.mentor_id == me.id,
        can_reply=owned,
        can_close=may_close(me, req),
        escalated=req.escalated_at is not None,
    )


def may_close(me: User, req: HelpRequest) -> bool:
    """B-M3: a request is closed by the responder who holds it or by the team,
    never by a responder who merely sees it in the pool."""
    return is_team(me) or req.mentor_id == me.id


async def visible_request(session, me: User, request_id: uuid.UUID) -> HelpRequest:
    paused = await is_paused(session, me)
    req = await session.scalar(
        select(HelpRequest).where(
            HelpRequest.id == request_id,
            # Security review #2 and CMP-03 R4: an assigned mentor keeps access
            # only while the request is not closed, and to a private mentor
            # thread only while the link lives (assigned_clause).
            visible_clause(me, now(), paused=paused),
        )
    )
    if req is None:
        raise not_found()
    return req


@router.get("/requests", response_model=list[RequestRow])
async def list_requests(session: Session, me: Responder) -> list[RequestRow]:
    t = now()
    order = (
        case((or_(HelpRequest.kind == "urgent", HelpRequest.escalated_at.is_not(None)), 0), (HelpRequest.status == "open", 1), else_=2),
        case((HelpRequest.status == "open", HelpRequest.last_activity_at), else_=None).asc().nulls_last(),
        HelpRequest.last_activity_at.desc(),
    )
    clause = visible_clause(me, t, paused=await is_paused(session, me))
    rows = await session.scalars(select(HelpRequest).where(clause).order_by(*order).limit(100))
    return [await _row(session, r, me) for r in rows]


@router.get("/requests/{request_id}", response_model=InboxThread)
async def open_request(request_id: uuid.UUID, session: Session, me: Responder, before: uuid.UUID | None = None) -> InboxThread:
    req = await visible_request(session, me, request_id)
    # R8: the team reads an escalated conversation whole, hidden messages marked.
    staff_view = is_team(me) and req.mentor_id != me.id and (req.escalated_at is not None or req.kind == "urgent")
    if staff_view and req.escalated_at is not None:
        await _record_staff_read(session, req.id, me.id)
    msgs, has_earlier = await message_page(session, req.id, before)
    # CMP-04 R2: a message this responder reported is hidden for him at once.
    reported = set(await session.scalars(select(Report.target_id).where(Report.reporter_id == me.id, Report.target_type == "help_message")))
    names: dict[uuid.UUID, str] = {}
    out = []
    for m in msgs:
        mine = m.author_id == me.id
        if m.id in reported or (m.hidden and not mine and not staff_view):
            continue  # CMP-04 R5: the author still sees his own hidden message, marked for review
        name = None
        if m.author == "mentor" and m.author_id:
            if m.author_id not in names:
                u = await session.get(User, m.author_id)
                names[m.author_id] = u.display_name if u else ""
            name = names[m.author_id]
        out.append(
            ThreadMessage(id=m.id, author=m.author, name=name, mine=mine, body=m.body, created_at=m.created_at, hidden=m.hidden)  # type: ignore[arg-type]
        )
    await session.execute(
        update(HelpMessage)
        .where(HelpMessage.request_id == req.id, HelpMessage.author == "learner", HelpMessage.read_at.is_(None))
        .values(read_at=now())
    )
    await session.commit()
    row = await _row(session, req, me)
    referred = list(await session.scalars(select(ScholarReferral.message_id).where(ScholarReferral.request_id == req.id)))
    return InboxThread(**row.model_dump(), messages=out, referred=referred, has_earlier=has_earlier)


STAFF_READ_EVERY = timedelta(days=1)


async def _record_staff_read(session, request_id: uuid.UUID, staff_id: uuid.UUID) -> None:
    """R8: who on the team opened an escalated private thread, once a day per
    person and thread, in the event history; ids only, never the text."""
    seen = await session.scalar(
        select(OutboxEvent.id)
        .where(
            OutboxEvent.name == "EscalatedThreadRead",
            payload_text("user_id") == str(staff_id),
            payload_text("request_id") == str(request_id),
            OutboxEvent.created_at > now() - STAFF_READ_EVERY,
        )
        .limit(1)
    )
    if seen is None:
        await publish(session, "EscalatedThreadRead", "CMP", {"request_id": str(request_id), "user_id": str(staff_id)})


class ReplyIn(BaseModel):
    body: str = Field(max_length=4000)


@router.post("/requests/{request_id}/messages", status_code=201, response_model=RequestRow)
async def reply(request_id: uuid.UUID, body: ReplyIn, session: Session, me: Responder) -> RequestRow:
    req = await visible_request(session, me, request_id)
    if req.learner_id is None and req.guest_token_hash is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no_owner_yet")  # an alert nobody opened yet
    ratelimit.hit(f"inbox-reply:{me.id}", 60, 60)
    ratelimit.hit(f"inbox-reply-day:{req.id}", THREAD_MSGS_PER_DAY, 86400)
    text = await clean_body_async(body.body)
    t = now()
    if req.mentor_id is None or (req.mentor_id != me.id and req.first_reply_at is None and req.kind != "mentor"):
        req.mentor_id = me.id  # R3: the first reply claims it (never a private mentor thread: R8)
    req.first_reply_at = req.first_reply_at or t
    req.status = "answered"
    req.last_activity_at = t
    session.add(HelpMessage(request_id=req.id, author="mentor", author_id=me.id, body=text, created_at=t))
    if req.learner_id is not None:
        link = await session.get(MentorLink, req.learner_id)
        if link is not None and link.mentor_id == me.id and link.welcomed_at is None:
            link.welcomed_at = t  # CMP-03 R5 ex2
        await mentor_contacted(session, link, me.id, t)  # MOT-08 R6
    await session.commit()
    url = f"/mentor/help/{req.id}"
    if req.learner_id is not None:
        notify.later(notify.to_user, req.learner_id, "reply", url)
    elif req.push_endpoint:
        notify.later(notify.to_endpoint, req.push_endpoint, "reply", req.lang, url)
    return await _row(session, req, me)


@router.post("/requests/{request_id}/close", response_model=RequestRow)
async def close(request_id: uuid.UUID, session: Session, me: Responder) -> RequestRow:
    req = await visible_request(session, me, request_id)
    if not may_close(me, req):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not_assigned")  # B-M3
    if req.escalated_at is not None and is_team(me) and req.mentor_id != me.id:
        # R8: the team ends the escalation; the thread stays the learner's and his mentor's.
        req.escalated_at = None
        await session.commit()
        return await _row(session, req, me)
    req.status = "closed"
    await session.commit()
    return await _row(session, req, me)


@router.post("/requests/{request_id}/urgent", response_model=RequestRow)
async def make_urgent(request_id: uuid.UUID, session: Session, me: Responder) -> RequestRow:
    """R5 ex2: a mentor hands a harmful situation on. B-M3: a conversation a
    responder already holds (a private mentor thread, or a request someone
    answered) stays with its holder and goes to the team only; a request
    nobody answered yet goes to the team and every mentor (rules.md §2.8)."""
    req = await visible_request(session, me, request_id)
    if req.kind == "mentor":
        # R8: a private thread stays ONE thread (kind kept): its mentor and the
        # team read all of it, before and after; a neutral push to the team only.
        if req.escalated_at is None:
            req.escalated_at = now()
            req.status = "open" if req.status == "closed" else req.status
            await session.commit()
            notify.later(notify.to_role, ["team", "admin"], "urgent", "/inbox")
        return await _row(session, req, me)
    if req.kind != "urgent":
        held = req.mentor_id is not None and (req.kind == "mentor" or req.first_reply_at is not None)
        if not held:
            req.mentor_id = None  # nobody answered: the first available person takes it
        req.kind = "urgent"
        req.status = "open" if req.status == "closed" else req.status
        await session.commit()
        if held:
            notify.later(notify.to_role, ["team", "admin"], "urgent", "/inbox")
        else:
            notify.later(notify.to_responders, "urgent", "/inbox")
    return await _row(session, req, me)


# --- mentees (R6) --------------------------------------------------------


class MenteeOut(BaseModel):
    id: uuid.UUID
    display_name: str
    chosen_at: datetime
    needs_welcome: bool
    shares_progress: bool
    status: str | None = None
    status_changed_at: datetime | None = None
    thread_id: uuid.UUID | None = None


@router.get("/mentees", response_model=list[MenteeOut])
async def mentees(session: Session, me: Mentor) -> list[MenteeOut]:
    rows = await session.execute(
        select(MentorLink, User.display_name, MenteeStatus)
        .join(User, User.id == MentorLink.learner_id)
        .outerjoin(MenteeStatus, MenteeStatus.user_id == MentorLink.learner_id)
        .where(MentorLink.mentor_id == me.id)
        .order_by(MentorLink.chosen_at.desc())
    )
    out = []
    for link, name, st in rows:
        thread_id = await session.scalar(
            select(HelpRequest.id).where(
                HelpRequest.learner_id == link.learner_id, HelpRequest.kind == "mentor", HelpRequest.mentor_id == me.id
            )
        )
        row = MenteeOut(
            id=link.learner_id,
            display_name=name,
            chosen_at=link.chosen_at,
            needs_welcome=link.welcomed_at is None,
            shares_progress=link.share_progress,
            thread_id=thread_id,
        )
        if link.share_progress and st is not None:  # MOT-07 R6: only with permission
            row.status, row.status_changed_at = st.status, st.changed_at
        out.append(row)
    return out


@router.post("/mentees/{learner_id}/thread", response_model=RequestRow)
async def mentee_thread(learner_id: uuid.UUID, session: Session, me: Mentor) -> RequestRow:
    """The mentor opens the private thread with a mentee (to welcome them, CMP-03 R5)."""
    link = await session.get(MentorLink, learner_id)
    if link is None or link.mentor_id != me.id:
        raise not_found()
    from app.companion.mentors import get_or_create_thread

    req = await get_or_create_thread(session, link)
    await session.commit()
    return await _row(session, req, me)


# --- the mentor rules (ORG-02 R2) ------------------------------------------


class RulesOut(BaseModel):
    required: bool
    accepted_at: datetime | None
    suspended: bool


@router.get("/rules", response_model=RulesOut)
async def get_rules(session: Session, user: CurrentUser) -> RulesOut:
    """Whether the inbox waits for the mentor rules. The rules' text lives in
    the app (ar/en/tl); the server keeps only when they were accepted."""
    if not user.has("mentor"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentors_only")
    prof = await session.get(MentorProfile, user.id)
    accepted = prof.rules_accepted_at if prof else None
    return RulesOut(required=not is_team(user) and accepted is None, accepted_at=accepted, suspended=bool(prof and prof.suspended))


@router.post("/rules", response_model=RulesOut)
async def accept_rules(session: Session, user: CurrentUser) -> RulesOut:
    if not user.has("mentor"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mentors_only")
    prof = await profile_of(session, user.id)
    prof.rules_accepted_at = prof.rules_accepted_at or now()
    await session.commit()
    return RulesOut(required=False, accepted_at=prof.rules_accepted_at, suspended=prof.suspended)


# --- profile -------------------------------------------------------------


MENTEE_CAP_DEFAULT = 8  # R4: personal mentees; group members have their own cap (CMP-05)
MENTEE_CAP_MAX = 10


class ProfileIn(BaseModel):
    about: str = Field(default="", max_length=400)
    availability: str = Field(default="", max_length=120)
    accepting: bool = True
    capacity: int = Field(default=MENTEE_CAP_DEFAULT, ge=1, le=MENTEE_CAP_MAX)


class ProfileOut(ProfileIn):
    mentees: int
    languages: list[str]
    gender: str | None


async def profile_of(session, user_id: uuid.UUID) -> MentorProfile:
    prof = await session.get(MentorProfile, user_id)
    if prof is None:
        prof = MentorProfile(user_id=user_id, capacity=MENTEE_CAP_DEFAULT, about="", availability="", accepting=True)
        session.add(prof)
        await session.flush()
    return prof


@router.get("/profile", response_model=ProfileOut)
async def get_profile(session: Session, me: Mentor) -> ProfileOut:
    prof = await profile_of(session, me.id)
    await session.commit()
    n = await session.scalar(select(func.count()).select_from(MentorLink).where(MentorLink.mentor_id == me.id))
    return ProfileOut(
        about=prof.about,
        availability=prof.availability,
        accepting=prof.accepting,
        capacity=prof.capacity,
        mentees=n or 0,
        languages=me.languages or [],
        gender=me.gender,
    )


@router.put("/profile", response_model=ProfileOut)
async def put_profile(body: ProfileIn, session: Session, me: Mentor) -> ProfileOut:
    prof = await profile_of(session, me.id)
    await clean_body_async(body.about, required=False)  # no contact details in the public card either
    await clean_body_async(body.availability, required=False)
    prof.about, prof.availability, prof.accepting, prof.capacity = (
        body.about.strip(),
        body.availability.strip(),
        body.accepting,
        body.capacity,
    )
    await session.commit()
    return await get_profile(session, me)
