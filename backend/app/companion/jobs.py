"""CMP-08 R6: once a day, mentor applications past their retention are
deleted (unanswered for 90 days, or 90 days after the decision)."""

from zoneinfo import ZoneInfo

from apscheduler.triggers.cron import CronTrigger

from app.companion.applications import purge
from app.core.db import SessionLocal


async def _run() -> None:
    async with SessionLocal() as session:
        await purge(session)


def register(scheduler) -> None:
    trigger = CronTrigger(hour=0, minute=20, timezone=ZoneInfo("Asia/Riyadh"))
    scheduler.add_job(_run, trigger, id="cmp-applications-purge", replace_existing=True, misfire_grace_time=3600)
