"""MOT-06 weekly group challenge.

Members come from Companion's events (GroupCreated / GroupJoined /
GroupLeft) into Motivation's own copy. Learning interactions come from the
device as a learning log, stored only for group members (minimum data).

R1 one challenge per group at a time, 7 days from when members see it, six
   types chosen by the group's mentor.
R2 types 1–5 are counted from learning events only; nothing gets unlocked.
R3 free text waits for the Sharia reviewer; worship is rejected there; an
   approved text becomes a template any mentor reuses at once.
R4 progress is a count over current members, never names; the mentor also
   learns who is done among members who share progress with *them*
   (asked live from Companion, never copied).
R5 when it ends, the group sees what it reached, with encouragement.
No points, no ranking (rules.md §3).
"""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, Session
from app.core.events import subscribe
from app.learning.public import is_live
from app.motivation.models import Challenge, ChallengeCheck, ChallengeTemplate, GroupMembership, LearningLog
from app.motivation.router import _when
from app.platform import push
from app.platform.models import User

router = APIRouter(prefix="/api", tags=["motivation"])
DURATION = timedelta(days=7)
RUNNING = ("pending_review", "active")

ChallengeType = Literal["lesson", "unit", "lessons_each", "days_each", "group_total", "free_text"]

PUSH = {  # neutral: no religious word, no names, no blame
    "started": {
        "ar": "لمجموعتك هدف جديد هذا الأسبوع",
        "en": "Your group has a new goal this week",
        "tl": "May bagong layunin ang grupo mo ngayong linggo",
    },
    "update": {"ar": "لديك تحديث في مجموعتك", "en": "There's an update in your group", "tl": "May update sa grupo mo"},
}


# --- membership from Companion events ------------------------------------


async def _upsert(session: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID, is_mentor: bool) -> None:
    row = await session.get(GroupMembership, (group_id, user_id))
    if row is None:
        session.add(GroupMembership(group_id=group_id, user_id=user_id, is_mentor=is_mentor))
    else:
        row.is_mentor = row.is_mentor or is_mentor


@subscribe("GroupCreated")
async def on_group_created(session: AsyncSession, payload: dict) -> None:
    await _upsert(session, uuid.UUID(payload["group_id"]), uuid.UUID(payload["mentor_id"]), True)


@subscribe("GroupJoined")
async def on_group_joined(session: AsyncSession, payload: dict) -> None:
    await _upsert(session, uuid.UUID(payload["group_id"]), uuid.UUID(payload["user_id"]), False)


@subscribe("GroupLeft")
async def on_group_left(session: AsyncSession, payload: dict) -> None:
    await session.execute(
        delete(GroupMembership).where(
            GroupMembership.group_id == uuid.UUID(payload["group_id"]),
            GroupMembership.user_id == uuid.UUID(payload["user_id"]),
            GroupMembership.is_mentor.is_(False),
        )
    )


async def member_ids(session: AsyncSession, group_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        await session.scalars(
            select(GroupMembership.user_id).where(GroupMembership.group_id == group_id, GroupMembership.is_mentor.is_(False))
        )
    )


async def _role(session: AsyncSession, group_id: uuid.UUID, user: User) -> str:
    row = await session.get(GroupMembership, (group_id, user.id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return "mentor" if row.is_mentor else "member"


# --- learning log -----------------------------------------------------------


class LogEntry(BaseModel):
    kind: Literal["lesson", "unit", "day"]
    item_id: str = Field(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9_.:-]+$")
    at: datetime | None = None
    day: date | None = None  # the device's local day (MOT-02)
    is_repeat: bool = False


class LogIn(BaseModel):
    entries: list[LogEntry] = Field(max_length=500)


@router.post("/me/learning-log")
async def learning_log(body: LogIn, session: Session, user: CurrentUser) -> dict:
    in_group = await session.scalar(
        select(GroupMembership.group_id).where(GroupMembership.user_id == user.id, GroupMembership.is_mentor.is_(False)).limit(1)
    )
    if in_group is None:
        return {"stored": 0}  # minimum data: only group challenges need this
    now = datetime.now(UTC)
    stored = 0
    for e in body.entries:
        at = _when(e.at, now)
        if e.kind == "day":
            try:
                day = date.fromisoformat(e.item_id)
            except ValueError:
                continue
            if e.at is None:  # a learning day carries its own date, never "now" (sync or sign-in copies)
                at = _when(datetime.combine(day, time(12), UTC), now)
            dup = select(LearningLog.id).where(LearningLog.user_id == user.id, LearningLog.kind == "day", LearningLog.item_id == e.item_id)
        else:
            day = e.day or at.date()
            dup = select(LearningLog.id).where(
                LearningLog.user_id == user.id, LearningLog.kind == e.kind, LearningLog.item_id == e.item_id, LearningLog.at == at
            )
        if await session.scalar(dup.limit(1)):
            continue
        session.add(LearningLog(user_id=user.id, kind=e.kind, item_id=e.item_id, is_repeat=e.is_repeat, day=day, at=at))
        stored += 1
    await session.commit()
    return {"stored": stored}


# --- challenges ---------------------------------------------------------


class ChallengeIn(BaseModel):
    type: ChallengeType
    target_id: str | None = Field(default=None, max_length=16, pattern=r"^[A-Za-z0-9_.:-]+$")
    target_count: int | None = Field(default=None, ge=1, le=1000)
    text: str | None = Field(default=None, min_length=3, max_length=200)
    text_lang: Literal["ar", "en", "tl"] | None = None
    template_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _fits_type(self):
        t = self.type
        if t in ("lesson", "unit") and not self.target_id:
            raise ValueError("target_id_required")
        if t in ("lessons_each", "group_total") and not self.target_count:
            raise ValueError("target_count_required")
        if t == "days_each" and not (self.target_count and 1 <= self.target_count <= 7):
            raise ValueError("days_between_1_and_7")
        if t == "free_text" and not (self.text or self.template_id):
            raise ValueError("text_or_template_required")
        return self


class ChallengeOut(BaseModel):
    id: uuid.UUID
    type: str
    target_id: str | None
    target_count: int | None
    text: str | None
    text_lang: str | None
    status: str
    starts_at: datetime | None
    ends_at: datetime | None
    ended: bool
    done: int
    of: int
    counts: Literal["members", "lessons"]
    mine: bool | None = None  # the asking member's own state
    my_lessons: int | None = None  # group_total: what I added
    shared_done: list[uuid.UUID] | None = None  # mentor only (R4 ex3)


async def _progress(session: AsyncSession, c: Challenge, members: list[uuid.UUID]) -> tuple[set[uuid.UUID], int, dict[uuid.UUID, int]]:
    """(members done, group total of lessons, lessons per member)."""
    if not members or c.starts_at is None or c.ends_at is None:
        return set(), 0, {}
    window = (LearningLog.user_id.in_(members), LearningLog.at >= c.starts_at, LearningLog.at < c.ends_at)
    per: dict[uuid.UUID, int] = {}
    if c.type in ("lesson", "unit"):
        rows = await session.scalars(
            select(LearningLog.user_id).where(*window, LearningLog.kind == c.type, LearningLog.item_id == c.target_id)
        )
        return set(rows), 0, {}
    if c.type in ("lessons_each", "group_total"):
        rows = await session.execute(
            select(LearningLog.user_id, func.count()).where(*window, LearningLog.kind == "lesson").group_by(LearningLog.user_id)
        )
        per = {u: n for u, n in rows}
        done = {u for u, n in per.items() if c.type == "lessons_each" and n >= (c.target_count or 0)}
        return done, sum(per.values()), per
    if c.type == "days_each":
        # Learning days as in MOT-02: lessons (repeats included) and review days.
        # A unit completion always comes with its lesson, so it adds no day.
        rows = await session.execute(
            select(LearningLog.user_id, func.count(func.distinct(LearningLog.day)))
            .where(*window, LearningLog.kind.in_(("lesson", "day")))
            .group_by(LearningLog.user_id)
        )
        return {u for u, n in rows if n >= (c.target_count or 0)}, 0, {}
    rows = await session.scalars(
        select(ChallengeCheck.user_id).where(ChallengeCheck.challenge_id == c.id, ChallengeCheck.user_id.in_(members))
    )
    return set(rows), 0, {}


async def challenge_out(session: AsyncSession, c: Challenge, viewer: User, role: str) -> ChallengeOut:
    members = await member_ids(session, c.group_id)  # R4: current members only
    done, total, per = await _progress(session, c, members)
    now = datetime.now(UTC)
    group_total = c.type == "group_total"
    out = ChallengeOut(
        id=c.id,
        type=c.type,
        target_id=c.target_id,
        target_count=c.target_count,
        text=c.text,
        text_lang=c.text_lang,
        status=c.status,
        starts_at=c.starts_at,
        ends_at=c.ends_at,
        ended=c.ends_at is not None and now >= c.ends_at,
        done=min(total, c.target_count or 0) if group_total else len(done),
        of=(c.target_count or 0) if group_total else len(members),
        counts="lessons" if group_total else "members",
    )
    if role == "member":
        out.mine = None if group_total else viewer.id in done
        out.my_lessons = per.get(viewer.id, 0) if group_total else None
    else:
        from app.companion.public import shared_learner_ids  # CMP's read interface (permission, live)

        shared = await shared_learner_ids(session, viewer.id)
        out.shared_done = sorted(done & shared, key=str)
    return out


async def _latest(session: AsyncSession, group_id: uuid.UUID, role: str) -> Challenge | None:
    q = select(Challenge).where(Challenge.group_id == group_id)
    if role == "member":
        q = q.where(Challenge.status == "active")  # R3: pending or rejected text is never shown to members
    else:
        q = q.where(Challenge.status.in_(("active", "pending_review", "rejected")))
    return await session.scalar(q.order_by(Challenge.created_at.desc()).limit(1))


async def _running(session: AsyncSession, group_id: uuid.UUID) -> Challenge | None:
    now = datetime.now(UTC)
    return await session.scalar(
        select(Challenge)
        .where(Challenge.group_id == group_id, Challenge.status.in_(RUNNING))
        .where((Challenge.ends_at.is_(None)) | (Challenge.ends_at > now))
        .limit(1)
    )


async def _announce(session: AsyncSession, group_id: uuid.UUID, kind: str) -> None:
    for uid in await member_ids(session, group_id):
        u = await session.get(User, uid)
        if u is not None:
            text = PUSH[kind].get(u.locale, PUSH[kind]["en"])
            await push.send_to_user(session, uid, {"title": text, "body": "", "url": "/mentor/group", "tag": "mot-challenge"})


def _start(c: Challenge) -> None:
    c.status = "active"
    c.starts_at = datetime.now(UTC)
    c.ends_at = c.starts_at + DURATION


@router.get("/groups/{group_id}/challenge", response_model=ChallengeOut | None)
async def get_challenge(group_id: uuid.UUID, session: Session, user: CurrentUser) -> ChallengeOut | None:
    role = await _role(session, group_id, user)
    c = await _latest(session, group_id, role)
    return await challenge_out(session, c, user, role) if c else None


@router.post("/groups/{group_id}/challenge", status_code=201, response_model=ChallengeOut)
async def create_challenge(group_id: uuid.UUID, body: ChallengeIn, session: Session, user: CurrentUser) -> ChallengeOut:
    if await _role(session, group_id, user) != "mentor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "group_mentor_only")
    if await _running(session, group_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "challenge_running")  # R1 ex2
    if body.type in ("lesson", "unit") and not await is_live(session, body.type, body.target_id or ""):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "target_not_approved")  # R1: an approved lesson or unit
    c = Challenge(group_id=group_id, type=body.type, created_by=user.id)
    if body.type in ("lesson", "unit"):
        c.target_id = body.target_id
    elif body.type != "free_text":
        c.target_count = body.target_count
    if body.type == "free_text":
        if body.template_id:
            tpl = await session.get(ChallengeTemplate, body.template_id)
            if tpl is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "template_not_found")
            c.text, c.text_lang, c.template_id = tpl.text, tpl.lang, tpl.id
            _start(c)  # R3 ex3: an approved template needs no new review
        else:
            c.text = " ".join((body.text or "").split())
            c.text_lang = body.text_lang or user.locale
            c.status = "pending_review"  # R3: invisible to members until approved
    else:
        _start(c)
    session.add(c)
    await session.commit()
    if c.status == "active":
        await _announce(session, group_id, "started")
        await session.commit()
    return await challenge_out(session, c, user, "mentor")


@router.delete("/groups/{group_id}/challenge", status_code=204)
async def withdraw(group_id: uuid.UUID, session: Session, user: CurrentUser) -> None:
    """A mentor may withdraw a free text still waiting for review."""
    if await _role(session, group_id, user) != "mentor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "group_mentor_only")
    c = await _running(session, group_id)
    if c is None or c.status != "pending_review":
        raise HTTPException(status.HTTP_409_CONFLICT, "nothing_to_withdraw")
    c.status = "withdrawn"
    await session.commit()


async def _member_challenge(session: AsyncSession, challenge_id: uuid.UUID, user: User) -> Challenge:
    c = await session.get(Challenge, challenge_id)
    if c is None or await _role(session, c.group_id, user) != "member":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    if c.type != "free_text" or c.status != "active" or (c.ends_at and datetime.now(UTC) >= c.ends_at):
        raise HTTPException(status.HTTP_409_CONFLICT, "not_checkable")
    return c


@router.post("/challenges/{challenge_id}/check", status_code=204)
async def check(challenge_id: uuid.UUID, session: Session, user: CurrentUser) -> None:
    """Type 6: the member marks it done themselves."""
    c = await _member_challenge(session, challenge_id, user)
    if await session.get(ChallengeCheck, (c.id, user.id)) is None:
        session.add(ChallengeCheck(challenge_id=c.id, user_id=user.id))
        await session.commit()


@router.delete("/challenges/{challenge_id}/check", status_code=204)
async def uncheck(challenge_id: uuid.UUID, session: Session, user: CurrentUser) -> None:
    c = await _member_challenge(session, challenge_id, user)
    await session.execute(delete(ChallengeCheck).where(ChallengeCheck.challenge_id == c.id, ChallengeCheck.user_id == user.id))
    await session.commit()


class TemplateOut(BaseModel):
    id: uuid.UUID
    text: str
    lang: str


@router.get("/challenges/templates", response_model=list[TemplateOut])
async def templates(session: Session, user: CurrentUser, lang: str | None = None) -> list[TemplateOut]:
    q = select(ChallengeTemplate).order_by(ChallengeTemplate.created_at.desc()).limit(100)
    if lang:
        q = q.where(ChallengeTemplate.lang == lang)
    return [TemplateOut(id=t.id, text=t.text, lang=t.lang) for t in await session.scalars(q)]


# --- Sharia review of free texts (R3) ---------------------------------------


async def reviewer(user: CurrentUser) -> User:
    # Only the Sharia reviewer approves text shown to learners (KNW-05 R5);
    # admins included `has()` implicitly, so check the role itself.
    if "sharia_reviewer" not in (user.roles or []):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "reviewers_only")
    return user


Reviewer = Annotated[User, Depends(reviewer)]


class PendingOut(BaseModel):
    id: uuid.UUID
    text: str | None
    text_lang: str | None
    created_at: datetime


@router.get("/challenges/pending", response_model=list[PendingOut])
async def pending(session: Session, user: Reviewer) -> list[PendingOut]:
    rows = await session.scalars(select(Challenge).where(Challenge.status == "pending_review").order_by(Challenge.created_at))
    return [PendingOut(id=c.id, text=c.text, text_lang=c.text_lang, created_at=c.created_at) for c in rows]


class ReviewIn(BaseModel):
    approve: bool


@router.post("/challenges/{challenge_id}/review", response_model=PendingOut)
async def review(challenge_id: uuid.UUID, body: ReviewIn, session: Session, user: Reviewer) -> PendingOut:
    c = await session.get(Challenge, challenge_id)
    if c is None or c.status != "pending_review":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    if body.approve:
        tpl = ChallengeTemplate(text=c.text or "", lang=c.text_lang or "ar", approved_by=user.id)
        session.add(tpl)
        await session.flush()
        c.template_id = tpl.id
        _start(c)  # its seven days start when members see it
    else:
        c.status = "rejected"  # R3 ex2: never shown to members
    await session.commit()
    if body.approve:
        await _announce(session, c.group_id, "started")
    elif c.created_by:
        u = await session.get(User, c.created_by)
        if u is not None:
            await push.send_to_user(
                session,
                u.id,
                {
                    "title": PUSH["update"].get(u.locale, PUSH["update"]["en"]),
                    "body": "",
                    "url": "/inbox?tab=groups",
                    "tag": "mot-challenge",
                },
            )
    await session.commit()
    return PendingOut(id=c.id, text=c.text, text_lang=c.text_lang, created_at=c.created_at)
