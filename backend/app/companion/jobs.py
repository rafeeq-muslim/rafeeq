"""CMP-08 R6: once a day, mentor applications past their retention are
deleted (unanswered for 90 days, or 90 days after the decision).

CMP-08 R3: at start and in the same daily run, a contact still stored as
plain text is encrypted (rows from before the encryption, or written by the
previous image during a rollback). Without keys this step does nothing and
the start logs one warning naming the two settings."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from app.companion.applications import encrypt_plaintext, purge
from app.core import crypto
from app.core.db import SessionLocal


async def _encrypt() -> None:
    async with SessionLocal() as session:
        await encrypt_plaintext(session)


async def _run() -> None:
    async with SessionLocal() as session:
        await purge(session)
        await encrypt_plaintext(session)


def register(scheduler) -> None:
    crypto.available()  # reads the keys once: the one start-up warning when they are missing
    trigger = CronTrigger(hour=0, minute=20, timezone=ZoneInfo("Asia/Riyadh"))
    scheduler.add_job(_run, trigger, id="cmp-applications-purge", replace_existing=True, misfire_grace_time=3600)
    soon = DateTrigger(run_date=datetime.now(UTC) + timedelta(seconds=20))
    scheduler.add_job(_encrypt, soon, id="cmp-applications-encrypt", replace_existing=True, misfire_grace_time=3600)
