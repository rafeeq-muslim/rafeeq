"""Security audit L10: once a day, sign-in rows nobody needs any more are deleted.

- `refresh_sessions` past their end: they can no longer sign anyone in.
- `one_time_codes` that were used or have expired (with their `pending_email`).

Old `outbox` rows are purged by app/core/retention.py (security audit A-H5,
branch sec-data-growth-limits), not here: one job owns that table's rule.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.platform.models import OneTimeCode, RefreshSession


async def purge(session: AsyncSession, now: datetime | None = None) -> dict[str, int]:
    now = now or datetime.now(UTC)
    statements = {
        "refresh_sessions": delete(RefreshSession).where(RefreshSession.expires_at < now),
        "one_time_codes": delete(OneTimeCode).where(or_(OneTimeCode.expires_at < now, OneTimeCode.used_at.is_not(None))),
    }
    counts = {}
    for table, statement in statements.items():
        counts[table] = (await session.execute(statement.execution_options(synchronize_session=False))).rowcount
    await session.commit()
    return counts


async def _run() -> None:
    async with SessionLocal() as session:
        await purge(session)


def register(scheduler) -> None:
    trigger = CronTrigger(hour=0, minute=40, timezone=ZoneInfo("Asia/Riyadh"))
    scheduler.add_job(_run, trigger, id="plt-retention-purge", replace_existing=True, misfire_grace_time=3600)
