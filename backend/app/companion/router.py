"""Companion & Community (CMP) API: CMP-01 help, CMP-02 inbox, CMP-03 mentors,
CMP-04 reports and blocks, CMP-05 groups. Importing this module also
registers the domain's event handlers."""

from fastapi import APIRouter

from app.companion import (
    events,  # noqa: F401  (registers DangerDetected / EngagementStatusChanged)
    groups,
    help,
    inbox,
    mentors,
    safety,
)

router = APIRouter()
for _r in (help.router, inbox.router, mentors.router, groups.router, safety.router):
    router.include_router(_r)
