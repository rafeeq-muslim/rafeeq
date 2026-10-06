"""PLT-05 R6: what Organisations keeps about one account: a coordinator's or
mentor's membership. A learner's organisation link belongs to the device
(install ID), not the account; the app adds it to the copy from the device
(`POST /api/org/link/status`)."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.organizations.models import Organization, OrgMember


async def export_user(session: AsyncSession, user_id: uuid.UUID) -> dict:
    m = await session.get(OrgMember, user_id)
    if m is None:
        return {"membership": None}
    org = await session.get(Organization, m.org_id)
    return {"membership": {"organization": org.name if org else None, "as": m.kind, "status": m.status, "approved_at": m.approved_at}}
