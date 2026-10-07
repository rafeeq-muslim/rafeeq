"""CMP-01 «أريد إنسانًا»: the learner's side of help requests.

Only what the person writes is sent, with where they came from (R1). No
account is needed (R2): a guest device gets a random token once; only its
hash is stored, and the device sends it back in `X-Help-Token`. Someone of
the requester's own gender answers (R3): an account uses its gender, a guest
is asked once («أخ أم أخت؟») and the device remembers; with nobody of that
gender free in that language the request waits for one and is never routed
to the other gender. Optional topics include non-religious ones (R4).
Messages never carry phone numbers, e-mails or messenger links (R5).
Replies are announced with a neutral push «لديك رد جديد» (R6).

Danger cases are out of CMP-01 now but stay in the companion domain (README
fixed rule): DangerDetected becomes an urgent request at once, answered by
the first available person whatever their gender, and never carrying the
question text (rules.md §2.8–2.9).
"""

import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, exists, func, select, update

from app.companion import notify
from app.companion.common import (
    CurrentOwner,
    Gender,
    Lang,
    Owner,
    guest_handle,
    new_guest_token,
    not_found,
    now,
    same_gender_available,
)
from app.companion.models import Block, HelpMessage, HelpRequest, MentorLink, Report
from app.companion.text import clean_body
from app.core import ratelimit
from app.core.deps import CurrentUser, Session
from app.core.security import sha256
from app.platform.models import User

router = APIRouter(prefix="/api/help", tags=["companion"])

Kind = Literal["human", "escalation", "urgent"]
Source = Literal["lesson", "review", "ask", "home", "mentor"]
Topic = Literal["religion", "family", "work_housing", "money", "feeling_low", "other"]
URGENT_WINDOW = timedelta(hours=24)
DANGEROUS = ("marriage", "money", "recruitment")


class RequestIn(BaseModel):
    kind: Kind = "human"
    source: Source | None = None
    topic: Topic | None = None
    gender: Gender | None = None  # R3: the requester's own gender (a guest is asked once)
    lang: Lang = "ar"
    body: str | None = Field(default=None, max_length=4000)
    ask_id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    push_endpoint: str | None = Field(default=None, max_length=1024, pattern=r"^https://")


class MessageIn(BaseModel):
    body: str = Field(max_length=4000)


class ThreadSummary(BaseModel):
    id: uuid.UUID
    kind: str
    topic: str | None
    source: str | None
    status: str
    created_at: datetime
    last_activity_at: datetime
    unread: int
    preview: str | None
    responder_name: str | None
    gender: str | None  # the requester's own, to word «أخ» / «أخت»
    awaiting_same_gender: bool  # R3 ex3: nobody of this gender is free in this language now


class MessageOut(BaseModel):
    id: uuid.UUID
    author: Literal["me", "mentor", "scholar", "system"]
    name: str | None
    body: str
    created_at: datetime
    hidden: bool = False  # only ever true on the learner's own message, hidden for review (CMP-04 R5)


class ThreadOut(ThreadSummary):
    messages: list[MessageOut]
    can_block: bool
    # CMP-03 R4: a conversation with a former mentor. It stays readable; what
    # the learner writes here goes to their current mentor or to the pool.
    link_ended: bool = False


class CreatedOut(BaseModel):
    request: ThreadSummary
    guest_token: str | None = None


# --- helpers -----------------------------------------------------------


REPLY_AUTHORS = ("mentor", "scholar")


async def _summary(session, req: HelpRequest) -> ThreadSummary:
    unread = await session.scalar(
        select(func.count())
        .select_from(HelpMessage)
        .where(
            HelpMessage.request_id == req.id,
            HelpMessage.author.in_(REPLY_AUTHORS),
            HelpMessage.read_at.is_(None),
            HelpMessage.hidden.is_(False),
        )
    )
    last = await session.scalar(
        select(HelpMessage.body)
        .where(HelpMessage.request_id == req.id, HelpMessage.hidden.is_(False))
        .order_by(HelpMessage.created_at.desc())
        .limit(1)
    )
    responder = (await session.get(User, req.mentor_id)).display_name if req.mentor_id and req.first_reply_at else None
    waiting = (
        req.kind in ("human", "escalation")
        and req.status == "open"
        and req.first_reply_at is None
        and req.mentor_id is None
        and not await same_gender_available(session, req.requester_gender, req.lang)
    )
    return ThreadSummary(
        id=req.id,
        kind=req.kind,
        topic=req.topic,
        source=req.source,
        status=req.status,
        created_at=req.created_at,
        last_activity_at=req.last_activity_at,
        unread=unread or 0,
        preview=last[:140] if last else None,
        responder_name=responder,
        gender=req.requester_gender,
        awaiting_same_gender=waiting,
    )


async def owned(session, owner: Owner, request_id: uuid.UUID) -> HelpRequest:
    req = await session.get(HelpRequest, request_id)
    if req is None or owner.anonymous or not owner.owns(req):
        raise not_found()  # R2: another device learns nothing, not even that it exists
    return req


async def _reported_by_owner(session, owner: Owner) -> set[uuid.UUID]:
    """Messages this owner reported for a non-dangerous reason: hidden for them only (CMP-04 R2)."""
    conds = []
    if owner.user is not None:
        conds.append(Report.reporter_id == owner.user.id)
    if owner.token_hash is not None:
        conds.append(Report.reporter_guest_hash == owner.token_hash)
    if not conds:
        return set()
    from sqlalchemy import or_

    rows = await session.scalars(select(Report.target_id).where(Report.target_type == "help_message", or_(*conds)))
    return set(rows)


async def _notify_mentor_of(req: HelpRequest) -> None:
    if req.kind == "urgent" and req.mentor_id is None:
        notify.later(notify.to_responders, "urgent", "/inbox")
    elif req.kind == "urgent":
        # Security review B-M3: a held urgent request is its holder's and the team's.
        notify.later(notify.to_user, req.mentor_id, "urgent", f"/inbox/r/{req.id}")
        notify.later(notify.to_role, ["team", "admin"], "urgent", "/inbox")
    elif req.mentor_id is not None:
        notify.later(notify.to_user, req.mentor_id, "message", f"/inbox/r/{req.id}")


async def _open_urgent(session, owner: Owner) -> HelpRequest | None:
    return await session.scalar(
        select(HelpRequest)
        .where(owner.clause(), HelpRequest.kind == "urgent", HelpRequest.status != "closed", HelpRequest.created_at > now() - URGENT_WINDOW)
        .order_by(HelpRequest.created_at.desc())
        .limit(1)
    )


async def _claim_alert(session, ask_id: str) -> HelpRequest | None:
    """CMP-01 R6 ex3: the alert from DangerDetected becomes the learner's request."""
    return await session.scalar(
        select(HelpRequest)
        .where(
            HelpRequest.ask_id == ask_id,
            HelpRequest.kind == "urgent",
            HelpRequest.learner_id.is_(None),
            HelpRequest.guest_token_hash.is_(None),
            HelpRequest.created_at > now() - URGENT_WINDOW,
        )
        .with_for_update()
        .limit(1)
    )


async def _requester_gender(session, owner: Owner, given: str | None) -> str:
    """R3: an account's own gender wins; a guest's device answers «أخ أم أخت؟»
    once. Security review B-M6: that first answer stays with the device's
    token on the server; a later request from it cannot name the other
    gender (the earliest answer wins over what is sent)."""
    if owner.user is not None and owner.user.gender:
        return owner.user.gender
    if owner.user is None and owner.token_hash is not None:
        first = await session.scalar(
            select(HelpRequest.requester_gender)
            .where(HelpRequest.guest_token_hash == owner.token_hash, HelpRequest.requester_gender.is_not(None))
            .order_by(HelpRequest.created_at)
            .limit(1)
        )
        if first:
            return first
    if given:
        return given
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "gender_required")


async def _link_ended(session, req: HelpRequest) -> bool:
    """CMP-03 R4: a mentor thread lives only as long as its link."""
    if req.kind != "mentor" or req.learner_id is None:
        return False
    link = await session.get(MentorLink, req.learner_id)
    return link is None or req.mentor_id is None or link.mentor_id != req.mentor_id


async def _where_to_write(session, user: User, old: HelpRequest) -> HelpRequest:
    """CMP-03 R4: writing in a former mentor's thread never reopens it to him.
    The words go to the current mentor's thread; with no mentor they become a
    request in the shared pool, answered by someone of the learner's own
    gender in their language (CMP-01 R3)."""
    from app.companion.mentors import get_or_create_thread

    link = await session.get(MentorLink, user.id)
    if link is not None:
        return await get_or_create_thread(session, link)
    t = now()
    req = HelpRequest(
        learner_id=user.id,
        handle=user.display_name,
        lang=user.locale if user.locale in ("ar", "en", "tl") else old.lang,
        kind="human",
        requester_gender=await _requester_gender(session, Owner(user=user, token_hash=None), None),
        created_at=t,
        last_activity_at=t,
    )
    session.add(req)
    await session.flush()
    return req


async def _handle_for(session, owner: Owner) -> str:
    if owner.user is not None:
        return owner.user.display_name
    existing = await session.scalar(select(HelpRequest.handle).where(HelpRequest.guest_token_hash == owner.token_hash).limit(1))
    return existing or guest_handle()


# --- endpoints ---------------------------------------------------------


@router.post("/requests", status_code=201, response_model=CreatedOut)
async def create_request(body: RequestIn, session: Session, owner: CurrentOwner, request: Request) -> CreatedOut:
    client = str(owner.user.id) if owner.user else owner.token_hash or (request.client.host if request.client else "-")
    ratelimit.hit(f"help-create:{client}", 10, 3600)
    # Security review #6: guest tokens are free to mint, so also limit by
    # address (in memory only, never stored) and cap urgent requests overall.
    address = request.client.host if request.client else "-"
    ratelimit.hit(f"help-create-ip:{address}", 15, 3600)
    if body.kind == "urgent":
        ratelimit.hit(f"help-urgent-ip:{address}", 3, 3600)
        ratelimit.hit("help-urgent-all", 60, 3600)
    token = None
    if owner.user is None and owner.token_hash is None:
        token = new_guest_token()
        owner = Owner(user=None, token_hash=sha256(token))
    text = clean_body(body.body, required=body.kind != "urgent")  # urgent needs no words
    gender = None if body.kind == "urgent" else await _requester_gender(session, owner, body.gender)  # danger: first available
    t = now()

    req: HelpRequest | None = None
    fresh = True
    if body.kind == "urgent":
        req = await _open_urgent(session, owner)
        if req is None and body.ask_id:
            req = await _claim_alert(session, body.ask_id)
            if req is not None:
                fresh = False  # responders were alerted when the danger was detected
        if req is not None:
            if req.learner_id is None and req.guest_token_hash is None:
                req.learner_id = owner.user.id if owner.user else None
                req.guest_token_hash = None if owner.user else owner.token_hash
                req.handle = await _handle_for(session, owner)
            else:
                fresh = False
    if req is None:
        mentor_id = None
        if owner.user is not None and body.kind != "urgent":
            link = await session.get(MentorLink, owner.user.id)
            mentor_id = link.mentor_id if link else None  # CMP-02 R3: own mentor first
        req = HelpRequest(
            learner_id=owner.user.id if owner.user else None,
            guest_token_hash=None if owner.user else owner.token_hash,
            handle=await _handle_for(session, owner),
            lang=body.lang,
            kind=body.kind,
            topic=body.topic,
            source=body.source,
            requester_gender=gender,
            ask_id=body.ask_id,
            mentor_id=mentor_id,
            created_at=t,
            last_activity_at=t,
        )
        session.add(req)
    req.push_endpoint = body.push_endpoint or req.push_endpoint
    req.source = req.source or body.source
    req.topic = req.topic or body.topic
    if text:
        await session.flush()
        session.add(
            HelpMessage(request_id=req.id, author="learner", author_id=owner.user.id if owner.user else None, body=text, created_at=t)
        )
        req.status = "open"
        req.last_activity_at = t
    await session.commit()
    if fresh or text:
        await _notify_mentor_of(req)
    return CreatedOut(request=await _summary(session, req), guest_token=token)


@router.get("/requests", response_model=list[ThreadSummary])
async def my_requests(session: Session, owner: CurrentOwner) -> list[ThreadSummary]:
    if owner.anonymous:
        return []
    # CMP-03 R4: a former mentor's thread with nothing in it (kept only as the record of the link) is not listed.
    empty_ended = and_(
        HelpRequest.kind == "mentor",
        HelpRequest.status == "closed",
        ~exists().where(HelpMessage.request_id == HelpRequest.id),
    )
    rows = await session.scalars(
        select(HelpRequest).where(owner.clause(), ~empty_ended).order_by(HelpRequest.last_activity_at.desc()).limit(50)
    )
    return [await _summary(session, r) for r in rows]


@router.get("/requests/{request_id}", response_model=ThreadOut)
async def thread(request_id: uuid.UUID, session: Session, owner: CurrentOwner) -> ThreadOut:
    req = await owned(session, owner, request_id)
    hidden_for_me = await _reported_by_owner(session, owner)
    msgs = list(await session.scalars(select(HelpMessage).where(HelpMessage.request_id == req.id).order_by(HelpMessage.created_at)))
    names: dict[uuid.UUID, str] = {}
    out: list[MessageOut] = []
    for m in msgs:
        if m.id in hidden_for_me or (m.hidden and m.author != "learner"):
            continue  # CMP-04 R5: the learner's own hidden message stays, marked for review
        name = None  # a scholar's answer is signed «أهل العلم» by the app, never by name
        if m.author == "mentor" and m.author_id:
            if m.author_id not in names:
                u = await session.get(User, m.author_id)
                names[m.author_id] = u.display_name if u else ""
            name = names[m.author_id]
        out.append(
            MessageOut(
                id=m.id,
                author="me" if m.author == "learner" else m.author,  # type: ignore[arg-type]
                name=name,
                body=m.body,
                created_at=m.created_at,
                hidden=m.hidden,
            )
        )
    await session.execute(
        update(HelpMessage)
        .where(HelpMessage.request_id == req.id, HelpMessage.author.in_(REPLY_AUTHORS), HelpMessage.read_at.is_(None))
        .values(read_at=now())
    )
    await session.commit()
    summary = await _summary(session, req)
    return ThreadOut(
        **summary.model_dump(),
        messages=out,
        can_block=req.mentor_id is not None and req.first_reply_at is not None,
        link_ended=await _link_ended(session, req),
    )


@router.post("/requests/{request_id}/messages", status_code=201, response_model=ThreadSummary)
async def post_message(request_id: uuid.UUID, body: MessageIn, session: Session, owner: CurrentOwner) -> ThreadSummary:
    req = await owned(session, owner, request_id)
    ratelimit.hit(f"help-msg:{req.id}", 30, 60)
    text = clean_body(body.body)
    if owner.user is not None and await _link_ended(session, req):
        req = await _where_to_write(session, owner.user, req)  # the summary returned says where it went
    t = now()
    session.add(HelpMessage(request_id=req.id, author="learner", author_id=owner.user.id if owner.user else None, body=text, created_at=t))
    req.status = "open"  # CMP-02 R4: writing in a closed request reopens it
    req.last_activity_at = t
    if owner.user is not None:
        req.handle = owner.user.display_name
    await session.commit()
    await _notify_mentor_of(req)
    return await _summary(session, req)


@router.post("/claim", status_code=200)
async def claim(session: Session, user: CurrentUser, owner: CurrentOwner) -> dict:
    """R2 ex3: a guest who creates an account keeps their requests."""
    if owner.token_hash is None:
        return {"moved": 0}
    res = await session.execute(
        update(HelpRequest)
        .where(HelpRequest.guest_token_hash == owner.token_hash, HelpRequest.learner_id.is_(None))
        .values(learner_id=user.id, guest_token_hash=None, handle=user.display_name)
    )
    await session.execute(
        update(Block).where(Block.blocker_guest_hash == owner.token_hash).values(blocker_id=user.id, blocker_guest_hash=None)
    )
    await session.commit()
    return {"moved": res.rowcount}  # type: ignore[attr-defined]


@router.delete("/guest", status_code=204)
async def erase_guest(session: Session, owner: CurrentOwner) -> None:
    """PLT-05 R4: «امسح بيانات هذا الجهاز». A guest device's conversations
    with a human (and their messages) and its blocks are deleted from the
    server too, so nothing the device sent stays behind it. Reports it filed
    stay for the team without the device's token. Accounts delete theirs with
    the account (PLT-05 R5)."""
    if owner.token_hash is None:
        return
    await session.execute(delete(HelpRequest).where(HelpRequest.guest_token_hash == owner.token_hash))
    await session.execute(delete(Block).where(Block.blocker_guest_hash == owner.token_hash))
    await session.execute(update(Report).where(Report.reporter_guest_hash == owner.token_hash).values(reporter_guest_hash=None))
    await session.commit()


@router.post("/requests/{request_id}/block", status_code=204)
async def block_responder(request_id: uuid.UUID, session: Session, owner: CurrentOwner) -> None:
    """CMP-04 R6 ex3: the request goes back to the pool (same gender); the blocked mentor no longer sees it."""
    req = await owned(session, owner, request_id)
    if req.mentor_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no_responder")
    mentor_id = req.mentor_id
    session.add(
        Block(
            blocker_id=owner.user.id if owner.user else None,
            blocker_guest_hash=None if owner.user else owner.token_hash,
            blocked_id=mentor_id,
        )
    )
    req.mentor_id = None
    req.status = "closed" if req.kind == "mentor" else "open"  # a private thread ends with the link
    if owner.user is not None:
        link = await session.get(MentorLink, owner.user.id)
        if link is not None and link.mentor_id == mentor_id:
            from app.companion.mentors import end_link

            await end_link(session, link)  # CMP-03 R4: his other requests for this learner return to the pool
    await session.commit()
