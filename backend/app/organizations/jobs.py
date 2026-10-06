"""ORG-03 R6: each organisation's figures frozen once a day, at 00:10
Asia/Riyadh (after MOT-07's 00:00 status refresh). A day's snapshot is never
recomputed, so a learner who unlinks later leaves past days as they were."""

from datetime import UTC, datetime

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.organizations.figures import RIYADH
from app.organizations.manage import compute
from app.organizations.models import Organization, OrgSnapshot


async def snapshot_all(session: AsyncSession, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    day = now.astimezone(RIYADH).date()
    made = 0
    for org in list(await session.scalars(select(Organization).where(Organization.active.is_(True)))):
        if await session.get(OrgSnapshot, (org.id, day)) is not None:
            continue
        session.add(OrgSnapshot(org_id=org.id, day=day, figures=await compute(session, org.id, now)))
        made += 1
    await session.commit()
    return made


async def _run() -> None:
    async with SessionLocal() as session:
        await snapshot_all(session)


def register(scheduler) -> None:
    scheduler.add_job(_run, CronTrigger(hour=0, minute=10, timezone=RIYADH), id="org-daily", replace_existing=True, misfire_grace_time=3600)
