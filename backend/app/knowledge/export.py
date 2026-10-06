"""PLT-05 R6: what Knowledge keeps about one account (KNW-09 saved items).
Questions to the assistant are never stored with an identity (rules.md §2.6)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge.models import SavedItem


async def export_user(session: AsyncSession, user_id: uuid.UUID) -> dict:
    items = await session.scalars(select(SavedItem).where(SavedItem.user_id == user_id).order_by(SavedItem.saved_at))
    return {"saved": [{"kind": i.kind, "ref": i.ref_id, "content": i.payload, "saved_at": i.saved_at} for i in items]}
