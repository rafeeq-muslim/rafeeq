"""What other domains may ask Organisations (docs/domains.md: a domain owns
its data). Used by CMP-08 (mentor applications that name an organisation)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import publish
from app.organizations.links import CODE_RE, normalize
from app.organizations.models import Organization, OrgCode, OrgMember


async def org_id_of_code(session: AsyncSession, code: str) -> uuid.UUID | None:
    """The active organisation behind one of its ORG-01 codes, or None."""
    c = normalize(code)
    row = await session.get(OrgCode, c) if CODE_RE.match(c) else None
    org = await session.get(Organization, row.org_id) if row else None
    return org.id if org is not None and org.active else None


async def org_names(session: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    rows = await session.execute(select(Organization.id, Organization.name).where(Organization.id.in_(ids)))
    return {i: n for i, n in rows}


async def approve_mentor(session: AsyncSession, user_id: uuid.UUID, org_id: uuid.UUID | None) -> None:
    """An existing account becomes a mentor (CMP-08 R5): one of the
    organisation's mentors when the application named one and the account
    belongs to no organisation yet (ORG-02 R1), a «رفيق» mentor otherwise.
    Companion hears MentorApproved either way. `user_id` repeats the id so
    account deletion removes the event (platform/auth.py::delete_account)."""
    if org_id is not None and await session.get(Organization, org_id) is not None and await session.get(OrgMember, user_id) is None:
        session.add(OrgMember(user_id=user_id, org_id=org_id, kind="mentor", status="active"))
    await publish(session, "MentorApproved", "ORG", {"mentor_id": str(user_id), "user_id": str(user_id)})
