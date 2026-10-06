"""Companion & Community (CMP) API: CMP-01 help, CMP-02 inbox and scholar
referrals, CMP-03 mentors, CMP-04 reports and blocks, CMP-05 groups.
CMP-06 (the private notebook) has no API: it never leaves the device.
Importing this module also registers the domain's event handlers."""

from fastapi import APIRouter

from app.companion import (
    events,  # noqa: F401  (registers DangerDetected / EngagementStatusChanged)
    groups,
    help,
    inbox,
    mentors,
    referrals,
    safety,
)

router = APIRouter()
for _r in (help.router, inbox.router, referrals.router, mentors.router, groups.router, safety.router):
    router.include_router(_r)
