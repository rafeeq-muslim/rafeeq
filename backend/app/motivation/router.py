"""Anonymous learning events (MOT-07 R4, MOT-09) and engagement status.

The device sends: a random install ID, the event type, lesson/objective IDs,
and when it happened. No IP is stored (the access log is off for this
route, see infra/web.nginx.conf), no question text, no identity. A device
that opts out sends one `opt_out` event; its install ID is then removed
from every stored event and it has no status any more.
"""

from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Request
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.deps import CurrentUser, Session
from app.core.events import OutboxEvent, publish
from app.motivation.engagement import after_interaction, status_at
from app.motivation.models import AnonEvent, EarnedBadge, EngagementState, StreakDay

RIYADH = ZoneInfo("Asia/Riyadh")
LEARNING = {"lesson_completed", "review_completed"}  # MOT-07: the only learning interactions

EventType = Literal[
    "lesson_completed",  # lesson_id, unit_id, is_repeat
    "review_completed",
    "unit_completed",  # unit_id
    "first_answer",  # MOT-09: objective_id, exercise_id, correct, context, shown
    "mastered",  # objective_id
    "why_shown",  # LRN-03 / MOT-09 R4: shown = ai_explanation | card_only
    "placement_done",  # value = units passed
    "placement_skipped",
    "guide_shown",  # MOT-09 R5
    "guide_followed",
    "opt_out",
]


class EventIn(BaseModel):
    type: EventType
    at: datetime | None = None
    lesson_id: str | None = Field(default=None, max_length=16)
    unit_id: str | None = Field(default=None, max_length=8)
    objective_id: str | None = Field(default=None, max_length=24)
    exercise_id: str | None = Field(default=None, max_length=24)
    correct: bool | None = None
    context: Literal["lesson", "review", "placement", "quick_check"] | None = None
    shown: Literal["ai_explanation", "card_only"] | None = None
    is_repeat: bool | None = None
    value: int | None = Field(default=None, ge=0, le=1000)


class EventsIn(BaseModel):
    install_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    events: list[EventIn] = Field(max_length=500)


router = APIRouter(prefix="/api", tags=["motivation"])


def _when(at: datetime | None, now: datetime) -> datetime:
    """Trust the device's clock only within the last 30 days (offline queues)."""
    if at is None:
        return now
    at = at if at.tzinfo else at.replace(tzinfo=UTC)
    return min(max(at, now - timedelta(days=30)), now)


@router.post("/events", status_code=202)
async def events(body: EventsIn, session: Session, request: Request) -> dict:
    ratelimit.hit(f"events:{body.install_id}", limit=60, window_s=60)
    ratelimit.hit(f"events-ip:{request.client.host if request.client else '-'}", limit=240, window_s=60)  # address kept in memory only
    now = datetime.now(UTC)
    if any(e.type == "opt_out" for e in body.events):
        await opt_out(session, body.install_id, now)
        await session.commit()
        return {"accepted": 1}

    interactions: list[datetime] = []
    for e in body.events:
        at = _when(e.at, now)
        session.add(
            AnonEvent(
                install_id=body.install_id,
                **e.model_dump(exclude={"at"}),
                day=at.astimezone(RIYADH).date(),
            )
        )
        if e.type in LEARNING:
            interactions.append(at)
    if interactions:
        await _interact(session, body.install_id, sorted(interactions), now)
    await session.commit()
    return {"accepted": len(body.events)}


async def _interact(session: AsyncSession, install_id: str, ats: list[datetime], now: datetime) -> None:
    st = await session.get(EngagementState, install_id)
    if st is None:
        st = EngagementState(install_id=install_id)
        session.add(st)
    before = st.status
    for at in ats:
        st.first_at, st.last_at, st.returned_at = after_interaction(at, st.first_at, st.last_at, st.returned_at)
    st.status = status_at(now, st.first_at, st.last_at, st.returned_at)
    if st.status != before:
        await publish(
            session,
            "EngagementStatusChanged",
            "MOT",
            {"install_id": install_id, "user_id": str(st.user_id) if st.user_id else None, "status": st.status},
        )


async def opt_out(session: AsyncSession, install_id: str, now: datetime) -> None:
    """MOT-07 R4 (error example): one bare opt-out event, then unlink everything."""
    st = await session.get(EngagementState, install_id)
    if st is not None and st.status is not None:
        # The device has no status any more: domains holding a copy (CMP-02 R6,
        # ORG-03) drop it. The event row itself is removed just below.
        await publish(
            session,
            "EngagementStatusChanged",
            "MOT",
            {"install_id": install_id, "user_id": str(st.user_id) if st.user_id else None, "status": None},
        )
    await session.execute(update(AnonEvent).where(AnonEvent.install_id == install_id).values(install_id=None))
    await session.execute(delete(EngagementState).where(EngagementState.install_id == install_id))
    # Status-change history must not keep the device's id either.
    await session.execute(delete(OutboxEvent).where(OutboxEvent.payload["install_id"].astext == install_id))
    session.add(AnonEvent(install_id=None, type="opt_out", day=now.astimezone(RIYADH).date()))


class InstallIn(BaseModel):
    install_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


@router.post("/me/install", status_code=204)
async def link_install(body: InstallIn, session: Session, user: CurrentUser) -> None:
    """MOT-07 R4: a guest who signs up keeps their status and history; they
    are the same learner, not a second new one."""
    await session.execute(update(EngagementState).where(EngagementState.install_id == body.install_id).values(user_id=user.id))
    await session.commit()


# --- Account copy of streak days and badges -------------------------------


class Badge(BaseModel):
    id: str = Field(max_length=24)
    earnedAt: AwareDatetime


class MotivationSync(BaseModel):
    days: list[date] = Field(default_factory=list, max_length=4000)
    badges: dict[Annotated[str, Field(max_length=24)], Badge] = Field(default_factory=dict, max_length=100)


async def _motivation_of(session: AsyncSession, user_id) -> MotivationSync:
    days = await session.scalars(select(StreakDay.day).where(StreakDay.user_id == user_id).order_by(StreakDay.day))
    badges = await session.scalars(select(EarnedBadge).where(EarnedBadge.user_id == user_id))
    return MotivationSync(days=list(days), badges={b.badge_id: Badge(id=b.badge_id, earnedAt=b.earned_at) for b in badges})


@router.get("/me/motivation")
async def get_motivation(session: Session, user: CurrentUser) -> MotivationSync:
    return await _motivation_of(session, user.id)


@router.put("/me/motivation")
async def merge_motivation(body: MotivationSync, session: Session, user: CurrentUser) -> MotivationSync:
    """MOT-02: the larger set of learning days wins (no mixing two histories
    into a streak neither had); MOT-03: badges are kept once, earliest date."""
    have = await _motivation_of(session, user.id)
    if len(set(body.days)) > len(have.days):
        await session.execute(delete(StreakDay).where(StreakDay.user_id == user.id))
        session.add_all(StreakDay(user_id=user.id, day=d) for d in sorted(set(body.days)))
    for bid, b in body.badges.items():
        row = await session.get(EarnedBadge, (user.id, bid))
        if row is None:
            session.add(EarnedBadge(user_id=user.id, badge_id=bid, earned_at=b.earnedAt))
        elif b.earnedAt < row.earned_at:
            row.earned_at = b.earnedAt
    await session.commit()
    return await _motivation_of(session, user.id)
