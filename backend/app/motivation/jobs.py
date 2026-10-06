"""MOT-07 R3 daily status refresh and MOT-08 R2 snapshot at 00:00 Asia/Riyadh."""

from datetime import UTC, datetime

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.motivation.engagement import STATUSES, status_at
from app.motivation.models import DailySnapshot, EngagementState
from app.motivation.router import (
    RIYADH,
    account_status_of,
    announce_account_status,
    publish_device_status,
    published_account_statuses,
)


async def refresh_and_snapshot(session: AsyncSession, now: datetime | None = None) -> DailySnapshot | None:
    now = now or datetime.now(UTC)
    states = list(await session.scalars(select(EngagementState)))
    for st in states:
        new = status_at(now, st.first_at, st.last_at, st.returned_at)
        if new != st.status:
            st.status = new
            await publish_device_status(session, st.install_id, new)

    # One subject per learner: a guest device on its own, an account once
    # with its one status across its devices (MOT-07 R2/R6), the same status
    # the mentor's copy gets.
    accounts: dict[str, list[EngagementState]] = {}
    subjects: dict[str, str | None] = {}
    for st in states:
        if st.user_id is not None:
            accounts.setdefault(str(st.user_id), []).append(st)
        else:
            subjects[f"i:{st.install_id}"] = st.status
    published = await published_account_statuses(session)
    for uid, rows in accounts.items():
        subjects[f"u:{uid}"] = account_status_of(now, rows)
        await announce_account_status(session, rows[0].user_id, subjects[f"u:{uid}"], published)  # type: ignore[arg-type]
    statuses = {k: v for k, v in subjects.items() if v is not None}

    day = now.astimezone(RIYADH).date()
    snap = None
    if await session.get(DailySnapshot, day) is None:  # R2: a day's snapshot is never recomputed
        counts = {s: 0 for s in STATUSES}
        for status in statuses.values():
            counts[status] += 1
        snap = DailySnapshot(day=day, counts=counts, transitions=statuses)
        session.add(snap)
    await session.commit()
    return snap


async def _run() -> None:
    async with SessionLocal() as session:
        await refresh_and_snapshot(session)


def register(scheduler) -> None:
    scheduler.add_job(_run, CronTrigger(hour=0, minute=0, timezone=RIYADH), id="mot-daily", replace_existing=True, misfire_grace_time=3600)
