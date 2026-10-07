"""Retention of the event history (`outbox`), security review 2026-10-07 (A-H5).

Every domain event is written to `outbox`; nothing ever removed old rows, so
the table only grew. Who still reads a row after it was handled:

- `EngagementStatusChanged` naming an account: Motivation reads the LATEST one
  per account, however old (`motivation/router.py::published_account_statuses`:
  what the mentor's copy shows now). The latest row per account is kept for
  ever; earlier ones go after the window.
- `MentorContacted`: Motivation's indicators read the last 30 days
  (`motivation/indicators.py`), Companion the current day (`companion/contact.py`).
- Every other event: handlers ran in the publishing transaction; the row is
  history only.

So a row older than `OUTBOX_DAYS` (three times the longest reader's window)
has no reader, except the one kept above. This purge is separate from any
purge of sessions or codes (Platform's own data, not this table).
"""

from datetime import UTC, datetime, timedelta

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal

OUTBOX_DAYS = 90
BATCH = 5000
MAX_BATCHES = 200  # one run removes at most a million rows; the next night continues

_PURGE = text(
    """
    DELETE FROM outbox WHERE id IN (
        SELECT o.id FROM outbox o
        WHERE o.created_at < :cutoff
          AND NOT (
            o.name = 'EngagementStatusChanged'
            AND (o.payload ->> 'user_id') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM outbox n
              WHERE n.name = 'EngagementStatusChanged'
                AND (n.payload ->> 'user_id') = (o.payload ->> 'user_id')
                AND n.created_at > o.created_at
            )
          )
        LIMIT :batch
    )
    """
)


async def purge_old_events(session: AsyncSession, now: datetime | None = None) -> int:
    """Delete outbox rows nobody reads any more. Returns how many went."""
    cutoff = (now or datetime.now(UTC)) - timedelta(days=OUTBOX_DAYS)
    total = 0
    for _ in range(MAX_BATCHES):
        n = (await session.execute(_PURGE, {"cutoff": cutoff, "batch": BATCH})).rowcount or 0
        await session.commit()
        total += n
        if n < BATCH:
            break
    return total


async def _run() -> None:
    async with SessionLocal() as session:
        await purge_old_events(session)


def register(scheduler) -> None:
    scheduler.add_job(
        _run, CronTrigger(hour=1, minute=40, timezone="UTC"), id="outbox-retention", replace_existing=True, misfire_grace_time=3600
    )
