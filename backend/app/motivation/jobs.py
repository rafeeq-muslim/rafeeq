"""MOT-07 R3 daily status refresh and MOT-08 R2 snapshot at 00:00 Asia/Riyadh."""

from datetime import UTC, datetime

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.core.events import publish
from app.motivation.engagement import STATUSES, status_at
from app.motivation.models import DailySnapshot, EngagementState
from app.motivation.router import RIYADH


async def refresh_and_snapshot(session: AsyncSession, now: datetime | None = None) -> DailySnapshot | None:
    now = now or datetime.now(UTC)
    states = list(await session.scalars(select(EngagementState)))
    for st in states:
        new = status_at(now, st.first_at, st.last_at, st.returned_at)
        if new != st.status:
            st.status = new
            await publish(
                session,
                "EngagementStatusChanged",
                "MOT",
                {"install_id": st.install_id, "user_id": str(st.user_id) if st.user_id else None, "status": new},
            )

    # One subject per learner: an account with several devices counts once,
    # with the status of its most recently used device.
    subjects: dict[str, EngagementState] = {}
    for st in states:
        if st.status is None or st.last_at is None:
            continue
        key = f"u:{st.user_id}" if st.user_id else f"i:{st.install_id}"
        if key not in subjects or st.last_at > subjects[key].last_at:  # type: ignore[operator]
            subjects[key] = st
    day = now.astimezone(RIYADH).date()
    snap = None
    if await session.get(DailySnapshot, day) is None:  # R2: a day's snapshot is never recomputed
        counts = {s: 0 for s in STATUSES}
        for st in subjects.values():
            counts[st.status] += 1  # type: ignore[index]
        snap = DailySnapshot(day=day, counts=counts, transitions={k: st.status for k, st in subjects.items()})
        session.add(snap)
    await session.commit()
    return snap


async def _run() -> None:
    async with SessionLocal() as session:
        await refresh_and_snapshot(session)


def register(scheduler) -> None:
    scheduler.add_job(_run, CronTrigger(hour=0, minute=0, timezone=RIYADH), id="mot-daily", replace_existing=True, misfire_grace_time=3600)
