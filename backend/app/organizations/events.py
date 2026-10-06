"""Events Organisations listens to (docs/domains.md).

- AccountCreated (PLT-02) with an organisation's invite: the new account
  becomes the organisation's coordinator or one of its mentors (ORG-02 R1);
  a mentor is announced to Companion as MentorApproved.
- EngagementStatusChanged (MOT-07): kept only for linked learners, matched
  by the device's install ID (ORG-03 counts linked learners only). A status
  of None (MOT-07 R4 opt-out) is kept as "no status".
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import publish, subscribe
from app.organizations.models import Organization, OrgLink, OrgLinkStatus, OrgMember


@subscribe("AccountCreated")
async def on_account_created(session: AsyncSession, payload: dict) -> None:
    invite = payload.get("invite") or {}
    if not invite.get("org_id") or invite.get("role") not in ("mentor", "org_coordinator"):
        return
    org_id = uuid.UUID(str(invite["org_id"]))
    if await session.get(Organization, org_id) is None:
        return
    user_id = uuid.UUID(str(payload["user_id"]))
    kind = "mentor" if invite["role"] == "mentor" else "coordinator"
    session.add(OrgMember(user_id=user_id, org_id=org_id, kind=kind, status="active", approved_at=datetime.now(UTC)))
    if kind == "mentor":
        await publish(session, "MentorApproved", "ORG", {"mentor_id": str(user_id)})


@subscribe("EngagementStatusChanged")
async def on_engagement(session: AsyncSession, payload: dict) -> None:
    install_id = payload.get("install_id")
    if not install_id:
        return
    link = await session.scalar(select(OrgLink).where(OrgLink.install_id == str(install_id)))
    if link is None:
        return  # not linked: Organisations keeps nothing about them
    status = payload.get("status")
    link.status = status
    session.add(OrgLinkStatus(link_id=link.id, status=status, at=datetime.now(UTC)))
