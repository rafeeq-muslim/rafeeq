"""Anonymous learning events (MOT-07 R4, MOT-09) and engagement status.

The device sends: a random install ID, the event type, lesson/objective IDs,
and when it happened. No IP is stored (the access log is off for this
route, see infra/web.nginx.conf), no question text, no identity. A device
that opts out sends one `opt_out` event; its install ID is then removed
from every stored event and it has no status any more.

`EngagementStatusChanged` has two subjects (MOT-07 R3/R6):
- a device: `{install_id, status}`, for Organisations, whose links are per
  device (ORG-01/ORG-03); it never names the account;
- an account: `{user_id, status}`, ONE status across the account's devices
  that share events (`engagement.account_timeline`), for Companion (what the
  mentor sees, CMP-02 R6). It is sent only when that account status changes,
  so an idle or opted-out second device never overwrites it.
"""

import re
import uuid
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Request
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.deps import CurrentUser, Session
from app.core.events import OutboxEvent, payload_text, publish, subscribe
from app.motivation.engagement import account_status, after_interaction, status_at
from app.motivation.models import AnonEvent, DailySnapshot, EarnedBadge, EngagementState, StreakDay

RIYADH = ZoneInfo("Asia/Riyadh")
BADGE_ID = re.compile(r"unit-[A-Za-z0-9_-]{1,16}|days-(7|30|66)")
LEARNING = {"lesson_completed", "review_completed"}  # MOT-07: the only learning interactions

EventType = Literal[
    "lesson_completed",  # lesson_id, unit_id, is_repeat
    "review_completed",
    "unit_completed",  # unit_id
    "first_answer",  # MOT-09: objective_id, exercise_id, correct, context, shown
    "mastered",  # objective_id
    "why_shown",  # LRN-03 / MOT-09 R4: shown = ai_explanation | card_holdout (random fifth) | card_only
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
    shown: Literal["ai_explanation", "card_holdout", "card_only"] | None = None
    is_repeat: bool | None = None
    value: int | None = Field(default=None, ge=0, le=1000)
    seq: int | None = Field(default=None, ge=0, le=2**62)  # MOT-09 R4: the device's event order


# One request carries at most this many events; the app sends its offline
# queue in batches of this size (frontend lib/api.ts EVENT_BATCH).
EVENTS_PER_REQUEST = 100
# Stored rows per minute: a lesson produces a few dozen events, so a device
# and a shared address (a class behind one router) stay far below these.
EVENTS_PER_MIN_DEVICE = 300
EVENTS_PER_MIN_ADDRESS = 600


class EventsIn(BaseModel):
    install_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    events: list[EventIn] = Field(max_length=EVENTS_PER_REQUEST)


router = APIRouter(prefix="/api", tags=["motivation"])


def _when(at: datetime | None, now: datetime) -> datetime:
    """Trust the device's clock only within the last 30 days (offline queues)."""
    if at is None:
        return now
    at = at if at.tzinfo else at.replace(tzinfo=UTC)
    return min(max(at, now - timedelta(days=30)), now)


@router.post("/events", status_code=202)
async def events(body: EventsIn, session: Session, request: Request) -> dict:
    address = request.client.host if request.client else "-"  # kept in memory only
    ratelimit.hit(f"events:{body.install_id}", limit=60, window_s=60)
    ratelimit.hit(f"events-ip:{address}", limit=240, window_s=60)
    now = datetime.now(UTC)
    if any(e.type == "opt_out" for e in body.events):
        await opt_out(session, body.install_id, now)
        await session.commit()
        return {"accepted": 1}

    # The limits above count requests; these count the rows a request stores,
    # per address first (one address can invent any number of device ids).
    for _ in body.events:
        ratelimit.hit(f"events-rows-ip:{address}", limit=EVENTS_PER_MIN_ADDRESS, window_s=60)
        ratelimit.hit(f"events-rows:{body.install_id}", limit=EVENTS_PER_MIN_DEVICE, window_s=60)
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
        await publish_device_status(session, install_id, st.status)
    if st.user_id is not None:
        await publish_account_status(session, st.user_id, now)


async def publish_device_status(session: AsyncSession, install_id: str, status: str | None) -> None:
    """The device's own status, for Organisations (links are per device)."""
    await publish(session, "EngagementStatusChanged", "MOT", {"install_id": install_id, "status": status})


async def published_account_statuses(session: AsyncSession, user_id: uuid.UUID | None = None) -> dict[str, str | None]:
    """The account status Motivation last announced, per account: the latest
    `EngagementStatusChanged` naming the account in the outbox (the event
    history, core/events.py). Older events that named both a device and the
    account count too: they hold what the mentor's copy shows now."""
    uid = payload_text("user_id")
    latest = func.row_number().over(partition_by=uid, order_by=OutboxEvent.created_at.desc()).label("n")
    q = select(uid.label("u"), OutboxEvent.payload["status"].astext.label("s"), latest).where(
        OutboxEvent.name == "EngagementStatusChanged", uid.is_not(None)
    )
    if user_id is not None:
        q = q.where(uid == str(user_id))
    sq = q.subquery()
    return {u: st for u, st in (await session.execute(select(sq.c.u, sq.c.s).where(sq.c.n == 1))).all()}


def account_status_of(now: datetime, devices: Iterable[EngagementState]) -> str | None:
    """MOT-07 R2/R6: one status per account, from its devices that share
    events (an opted-out device has no row any more). With no device left the
    account has no status (None)."""
    return account_status(now, ((d.first_at, d.last_at, d.returned_at) for d in devices))


async def announce_account_status(
    session: AsyncSession, user_id: uuid.UUID, status: str | None, published: dict[str, str | None] | None = None
) -> None:
    """Send the account's status only when it differs from the last one sent."""
    if published is None:
        published = await published_account_statuses(session, user_id)
    if status != published.get(str(user_id)):
        await publish(session, "EngagementStatusChanged", "MOT", {"user_id": str(user_id), "status": status})


async def publish_account_status(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    rows = await session.scalars(select(EngagementState).where(EngagementState.user_id == user_id))
    await announce_account_status(session, user_id, account_status_of(now, rows))


async def opt_out(session: AsyncSession, install_id: str, now: datetime) -> None:
    """MOT-07 R4 (error example): one bare opt-out event, then unlink everything.
    The device leaves its account's status; the account keeps the status of
    its other devices and has none only when no device of it is left."""
    st = await session.get(EngagementState, install_id)
    user_id = st.user_id if st is not None else None
    if st is not None and st.status is not None:
        # The device has no status any more: Organisations' copy (ORG-03)
        # drops it. The event row itself is removed just below.
        await publish_device_status(session, install_id, None)
    await session.execute(update(AnonEvent).where(AnonEvent.install_id == install_id).values(install_id=None))
    await session.execute(delete(EngagementState).where(EngagementState.install_id == install_id))
    if user_id is not None:
        await publish_account_status(session, user_id, now)
    # Status-change history must not keep the device's id either.
    await session.execute(delete(OutboxEvent).where(payload_text("install_id") == install_id))
    session.add(AnonEvent(install_id=None, type="opt_out", day=now.astimezone(RIYADH).date()))
    await scrub_snapshots(session, [f"i:{install_id}"])


async def scrub_snapshots(session: AsyncSession, keys: list[str]) -> None:
    """MOT-07 R4 (error example): the frozen daily snapshots keep their
    counts (MOT-08 R2), but the per-subject keys used for rates (a device or
    an account id) are removed, so nothing links the history to the person."""
    for key in keys:
        await session.execute(
            update(DailySnapshot).where(DailySnapshot.transitions.has_key(key)).values(transitions=DailySnapshot.transitions.op("-")(key))
        )


@subscribe("AccountDeleted")
async def on_account_deleted(session: AsyncSession, payload: dict) -> None:
    """rules.md §4 / MOT-07 R4: deleting the account unlinks its devices'
    events and status exactly like an opt-out, and removes its keys from the
    snapshots. Streak days, badges and the learning log cascade on users.id."""
    uid = payload.get("user_id")
    if not uid:
        return
    user_id = uuid.UUID(str(uid))
    installs = list(await session.scalars(select(EngagementState.install_id).where(EngagementState.user_id == user_id)))
    for install_id in installs:
        await session.execute(update(AnonEvent).where(AnonEvent.install_id == install_id).values(install_id=None))
        await session.execute(delete(OutboxEvent).where(payload_text("install_id") == install_id))
    await session.execute(delete(EngagementState).where(EngagementState.user_id == user_id))
    await scrub_snapshots(session, [f"u:{user_id}", *(f"i:{i}" for i in installs)])


class InstallIn(BaseModel):
    install_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


@router.post("/me/install", status_code=204)
async def link_install(body: InstallIn, session: Session, user: CurrentUser) -> None:
    """MOT-07 R4: a guest who signs up keeps their status and history; they
    are the same learner, not a second new one. The device joins the
    account's one status (R2/R6), which is published with the account so
    Companion's copy for the mentor fills (R3). A device that signs in before
    its first lesson is kept as the account's (no status yet), so its lessons
    count for the account later. The app links only devices that share events."""
    now = datetime.now(UTC)
    st = await session.get(EngagementState, body.install_id)
    if st is None:
        session.add(EngagementState(install_id=body.install_id, user_id=user.id))
    elif st.user_id != user.id:
        previous, st.user_id = st.user_id, user.id
        await session.flush()
        if previous is not None:
            await publish_account_status(session, previous, now)
        await publish_account_status(session, user.id, now)
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
        if not BADGE_ID.fullmatch(bid):
            continue  # MOT-03 R1: unit badges and 7/30/66 learning days only
        row = await session.get(EarnedBadge, (user.id, bid))
        if row is None:
            session.add(EarnedBadge(user_id=user.id, badge_id=bid, earned_at=b.earnedAt))
            # MOT-03 R1: BadgeEarned, to Companion (the mentor sees it only with permission, R6).
            await publish(session, "BadgeEarned", "MOT", {"user_id": str(user.id), "badge_id": bid, "earned_at": b.earnedAt.isoformat()})
        elif b.earnedAt < row.earned_at:
            row.earned_at = b.earnedAt
    await session.commit()
    return await _motivation_of(session, user.id)


class MenteeBadges(BaseModel):
    learner_id: uuid.UUID
    badges: list[Badge]


@router.get("/mentor/mentee-badges")
async def mentee_badges(session: Session, user: CurrentUser) -> list[MenteeBadges]:
    """MOT-03 R6: a mentor sees the badges of the learners who chose them
    and share progress with them now; the permission is asked live from
    Companion's read interface (never copied), so withdrawing it hides the
    badges at once. Nobody else (group members included) gets them."""
    from app.companion.public import shared_learner_ids

    ids = await shared_learner_ids(session, user.id)
    if not ids:
        return []
    rows = await session.scalars(select(EarnedBadge).where(EarnedBadge.user_id.in_(ids)).order_by(EarnedBadge.earned_at))
    out: dict[uuid.UUID, list[Badge]] = {}
    for b in rows:
        out.setdefault(b.user_id, []).append(Badge(id=b.badge_id, earnedAt=b.earned_at))
    return [MenteeBadges(learner_id=k, badges=v) for k, v in out.items()]
