"""Companion & Community (CMP) API: CMP-01 help, CMP-02 inbox and scholar
referrals, CMP-03 mentors, CMP-04 reports and blocks, CMP-05 groups.
CMP-06 (the private notebook) has no API: it never leaves the device.
Importing this module also registers the domain's event handlers."""

from fastapi import APIRouter

from app.companion import (
    applications,  # CMP-08
    coverage,
    events,  # noqa: F401  (registers DangerDetected / EngagementStatusChanged)
    groups,
    help,
    inbox,
    mentors,
    moderation,  # CMP-05 R8/R9: the team moderates groups
    referrals,
    safety,
)

router = APIRouter()
for _r in (
    help.router,
    inbox.router,
    referrals.router,
    mentors.router,
    groups.router,
    moderation.router,
    safety.router,
    coverage.router,
    applications.public,
    applications.staff,
    applications.org,
):
    router.include_router(_r)
