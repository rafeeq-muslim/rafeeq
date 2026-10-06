"""MOT-07 R3 daily status refresh and MOT-08 R2 snapshot at 00:00 Asia/Riyadh."""

from datetime import UTC, datetime, timedelta

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.motivation.engagement import STATUSES, status_at
from app.motivation.models import AnonEvent, DailySnapshot, EngagementState
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


# Anonymous events are read for the last 7 or 30 days only (MOT-08 R3,
# MOT-09: `indicators.py` loads `day >= today - days`); the status of a device
# lives in EngagementState and the history of rates in the frozen snapshots,
# neither of which is touched here. Three times the longest window is kept.
ANON_EVENT_DAYS = 90
_PURGE_BATCH = 5000
_PURGE_MAX_BATCHES = 400  # at most two million rows a night


async def purge_old_anon_events(session: AsyncSession, now: datetime | None = None) -> int:
    """Security review A-H5: anonymous events no indicator reads any more."""
    cutoff = (now or datetime.now(UTC)).astimezone(RIYADH).date() - timedelta(days=ANON_EVENT_DAYS)
    total = 0
    for _ in range(_PURGE_MAX_BATCHES):
        ids = select(AnonEvent.id).where(AnonEvent.day < cutoff).limit(_PURGE_BATCH)
        n = (await session.execute(delete(AnonEvent).where(AnonEvent.id.in_(ids)))).rowcount or 0
        await session.commit()
        total += n
        if n < _PURGE_BATCH:
            break
    return total


async def _run() -> None:
    async with SessionLocal() as session:
        await refresh_and_snapshot(session)


async def _purge() -> None:
    async with SessionLocal() as session:
        await purge_old_anon_events(session)


def register(scheduler) -> None:
    scheduler.add_job(_run, CronTrigger(hour=0, minute=0, timezone=RIYADH), id="mot-daily", replace_existing=True, misfire_grace_time=3600)
    scheduler.add_job(_purge, CronTrigger(hour=1, minute=20, timezone=RIYADH), id="mot-anon-retention", replace_existing=True, misfire_grace_time=3600)
