"""CMP-03 choose a mentor.

Needs an account (R1). Gender and languages are asked here only (R2), then
up to three mentors of the same gender who speak one of the learner's
languages, accept mentees and are under capacity, least loaded first. The
card shows display name, languages, about and availability only (R3). One
mentor at a time; changing or ending needs no reason and resets the
share-progress permission (R4). The mentor gets a neutral push and sees
«رحّب به» until their first message (R5). One private thread per pair, and
the permission is the learner's own switch, off by default (R6).
"""

import random
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import ARRAY, String, and_, cast, delete, func, select, update

from app.companion import notify
from app.companion.common import Gender, Lang, is_blocked, langs_of, not_found, now
from app.companion.inbox import MENTEE_CAP_DEFAULT, profile_of
from app.companion.models import Block, HelpRequest, MentorEnded, MentorLink, MentorProfile
from app.core.deps import CurrentUser, Session
from app.platform.auth import set_own_gender
from app.platform.models import User

router = APIRouter(prefix="/api/mentors", tags=["companion"])
SUGGESTIONS = 3


class MatchIn(BaseModel):
    gender: Gender
    languages: list[Lang] = Field(min_length=1, max_length=3)


class MentorCard(BaseModel):
    id: uuid.UUID
    display_name: str
    languages: list[str]
    about: str
    availability: str


class MineOut(BaseModel):
    mentor: MentorCard | None
    share_progress: bool
    chosen_at: datetime | None
    thread_id: uuid.UUID | None
    gender: str | None
    languages: list[str]
    # ORG-02 R5: the previous mentor is no longer available; choose another.
    # No reason and no organisation are ever given.
    mentor_ended: bool = False


async def _card(session, mentor: User) -> MentorCard:
    prof = await session.get(MentorProfile, mentor.id)
    return MentorCard(
        id=mentor.id,
        display_name=mentor.display_name,
        languages=mentor.languages or [],
        about=prof.about if prof else "",
        availability=prof.availability if prof else "",
    )


def _learner_langs(user: User) -> list[str]:
    return user.languages or [user.locale]


async def eligible_mentors(session, learner: User) -> list[User]:
    """R2: same gender, a shared language, accepting, under capacity, no block either way."""
    if not learner.gender:
        return []
    load = select(MentorLink.mentor_id, func.count().label("n")).group_by(MentorLink.mentor_id).subquery()
    blocked = select(Block.blocked_id).where(Block.blocker_id == learner.id)
    blocking = select(Block.blocker_id).where(Block.blocked_id == learner.id, Block.blocker_id.is_not(None))
    rows = await session.execute(
        select(User, func.coalesce(load.c.n, 0))
        .outerjoin(MentorProfile, MentorProfile.user_id == User.id)
        .outerjoin(load, load.c.mentor_id == User.id)
        .where(
            User.roles.op("@>")(cast(["mentor"], ARRAY(String(20)))),
            User.id != learner.id,
            User.gender == learner.gender,
            User.languages.op("&&")(cast(_learner_langs(learner), ARRAY(String(5)))),
            # ORG-02 R2, R5: only a mentor who accepted the mentor rules and is not suspended.
            and_(MentorProfile.accepting.is_(True), MentorProfile.suspended.is_(False), MentorProfile.rules_accepted_at.is_not(None)),
            func.coalesce(load.c.n, 0) < func.coalesce(MentorProfile.capacity, MENTEE_CAP_DEFAULT),  # group members not counted
            User.id.not_in(blocked),
            User.id.not_in(blocking),
        )
    )
    found = [(u, n, random.random()) for u, n in rows]
    found.sort(key=lambda x: (x[1], x[2]))  # least loaded first, ties at random
    return [u for u, _, _ in found]


async def get_or_create_thread(session, link: MentorLink) -> HelpRequest:
    req = await session.scalar(
        select(HelpRequest).where(
            HelpRequest.learner_id == link.learner_id, HelpRequest.kind == "mentor", HelpRequest.mentor_id == link.mentor_id
        )
    )
    if req is None:
        learner = await session.get(User, link.learner_id)
        t = now()
        req = HelpRequest(
            learner_id=link.learner_id,
            handle=learner.display_name if learner else "",
            lang=learner.locale if learner else "ar",
            kind="mentor",
            source="mentor",
            mentor_id=link.mentor_id,
            status="answered",  # nothing waits for a reply until the learner writes
            created_at=t,
            last_activity_at=t,
        )
        session.add(req)
        await session.flush()
    elif req.status == "closed":
        req.status = "answered"
    return req


def can_take(mentor: User | None, req: HelpRequest) -> bool:
    """CMP-01 R3: the requester's own gender, in the request's language."""
    if mentor is None:
        return False
    same_gender = req.requester_gender is None or req.requester_gender == mentor.gender
    return same_gender and req.lang in langs_of(mentor)


async def end_link(session, link: MentorLink, new_mentor_id: uuid.UUID | None = None) -> None:
    """R4: the link ends (changed, ended, blocked, suspended or approval
    withdrawn) and the old mentor no longer sees this learner. Their private
    thread closes and stays readable for the learner only; it never reopens
    to the old mentor (help.post_message, inbox.visible_clause). The learner's
    human/escalation requests he held move to the new mentor when he can take
    them (same gender, the request's language), otherwise back to the pool;
    closed ones too, so writing in them later never reaches the old mentor.
    Urgent requests keep their danger routing (rules.md §2.8).
    The pair's thread is kept (created closed if they never wrote) as the
    record that he was this learner's mentor: the pool hides the learner's
    requests from him (inbox.former_mentor_clause) until they choose him again."""
    await get_or_create_thread(session, link)
    await session.execute(
        update(HelpRequest)
        .where(HelpRequest.learner_id == link.learner_id, HelpRequest.kind == "mentor", HelpRequest.mentor_id == link.mentor_id)
        .values(status="closed")
    )
    new_mentor = await session.get(User, new_mentor_id) if new_mentor_id else None
    held = await session.scalars(
        select(HelpRequest).where(
            HelpRequest.learner_id == link.learner_id,
            HelpRequest.mentor_id == link.mentor_id,
            HelpRequest.kind.in_(("human", "escalation")),
        )
    )
    for req in held:
        req.mentor_id = new_mentor.id if new_mentor is not None and can_take(new_mentor, req) else None
    await session.delete(link)


@router.put("/me/match", response_model=MineOut)
async def set_match(body: MatchIn, session: Session, user: CurrentUser) -> MineOut:
    """R2: asked here only, to find a mentor of the same gender who speaks your language.
    A mentor's or team member's gender, once set, changes only by an admin (security)."""
    set_own_gender(user, body.gender)
    user.languages = list(dict.fromkeys(body.languages))
    await session.commit()
    return await mine(session, user)


@router.get("/suggestions", response_model=list[MentorCard])
async def suggestions(session: Session, user: CurrentUser) -> list[MentorCard]:
    if not user.gender:
        raise HTTPException(status.HTTP_409_CONFLICT, "match_profile_required")
    link = await session.get(MentorLink, user.id)
    mentors = [m for m in await eligible_mentors(session, user) if not link or m.id != link.mentor_id]
    return [await _card(session, m) for m in mentors[:SUGGESTIONS]]


class ChooseIn(BaseModel):
    mentor_id: uuid.UUID


@router.post("/choose", response_model=MineOut)
async def choose(body: ChooseIn, session: Session, user: CurrentUser) -> MineOut:
    if not user.gender:
        raise HTTPException(status.HTTP_409_CONFLICT, "match_profile_required")
    if body.mentor_id not in {m.id for m in await eligible_mentors(session, user)}:
        raise HTTPException(status.HTTP_409_CONFLICT, "mentor_unavailable")
    old = await session.get(MentorLink, user.id)
    if old is not None:
        if old.mentor_id == body.mentor_id:
            return await mine(session, user)
        await end_link(session, old, body.mentor_id)  # R4: one at a time; the old mentor stops seeing them
        await session.flush()
    session.add(MentorLink(learner_id=user.id, mentor_id=body.mentor_id, share_progress=False, chosen_at=now()))
    await session.execute(delete(MentorEnded).where(MentorEnded.learner_id == user.id))  # ORG-02 R5: notice done
    await profile_of(session, body.mentor_id)
    await session.commit()
    notify.later(notify.to_user, body.mentor_id, "new_mentee", "/inbox?tab=mentees")  # R5
    return await mine(session, user)


@router.get("/mine", response_model=MineOut)
async def mine(session: Session, user: CurrentUser) -> MineOut:
    link = await session.get(MentorLink, user.id)
    if link is None:
        return MineOut(
            mentor=None,
            share_progress=False,
            chosen_at=None,
            thread_id=None,
            gender=user.gender,
            languages=_learner_langs(user),
            mentor_ended=await session.get(MentorEnded, user.id) is not None,
        )
    mentor = await session.get(User, link.mentor_id)
    thread_id = await session.scalar(
        select(HelpRequest.id).where(
            HelpRequest.learner_id == user.id, HelpRequest.kind == "mentor", HelpRequest.mentor_id == link.mentor_id
        )
    )
    return MineOut(
        mentor=await _card(session, mentor) if mentor else None,
        share_progress=link.share_progress,
        chosen_at=link.chosen_at,
        thread_id=thread_id,
        gender=user.gender,
        languages=_learner_langs(user),
    )


@router.delete("/mine/notice", status_code=204)
async def dismiss_notice(session: Session, user: CurrentUser) -> None:
    """ORG-02 R5: the learner closes the «choose another mentor» notice."""
    await session.execute(delete(MentorEnded).where(MentorEnded.learner_id == user.id))
    await session.commit()


@router.delete("/mine", status_code=204)
async def end(session: Session, user: CurrentUser) -> None:
    link = await session.get(MentorLink, user.id)
    if link is not None:
        await end_link(session, link)
        await session.commit()


class ShareIn(BaseModel):
    share: bool


@router.put("/mine/share", response_model=MineOut)
async def share(body: ShareIn, session: Session, user: CurrentUser) -> MineOut:
    """MOT-07 R6 / glossary `share_progress_with_mentor`: the learner's own switch."""
    link = await session.get(MentorLink, user.id)
    if link is None:
        raise not_found()
    link.share_progress = body.share
    await session.commit()
    return await mine(session, user)


@router.post("/mine/thread")
async def thread(session: Session, user: CurrentUser) -> dict:
    link = await session.get(MentorLink, user.id)
    if link is None:
        raise not_found()
    req = await get_or_create_thread(session, link)
    await session.commit()
    return {"id": str(req.id)}


@router.post("/mine/block", status_code=204)
async def block_mentor(session: Session, user: CurrentUser) -> None:
    """CMP-04 R6 ex2: the link ends and the mentor no longer sees the learner."""
    link = await session.get(MentorLink, user.id)
    if link is None:
        raise not_found()
    if not await is_blocked(session, user.id, link.mentor_id):
        session.add(Block(blocker_id=user.id, blocked_id=link.mentor_id))
    await session.execute(
        update(HelpRequest)
        .where(
            HelpRequest.learner_id == user.id,
            HelpRequest.mentor_id == link.mentor_id,
            HelpRequest.kind != "mentor",
            HelpRequest.status != "closed",
        )
        .values(mentor_id=None, status="open")
    )
    await end_link(session, link)
    await session.commit()
