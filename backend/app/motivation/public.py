"""Motivation's read interface for other domains.

ORG-01 needs a newly linked learner's engagement status once, at the moment
of linking; after that it follows EngagementStatusChanged like any other
domain. Only the status word leaves Motivation, never events or dates.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.motivation.engagement import account_status
from app.motivation.models import EngagementState


async def current_status(session: AsyncSession, install_id: str | None, user_id: uuid.UUID | None = None) -> str | None:
    """MOT-07 status of this device, or the account's one status across its devices (R2/R6)."""
    if install_id:
        st = await session.get(EngagementState, install_id)
        if st is not None:
            return st.status
    if user_id is not None:
        rows = await session.scalars(select(EngagementState).where(EngagementState.user_id == user_id))
        return account_status(datetime.now(UTC), ((r.first_at, r.last_at, r.returned_at) for r in rows))
    return None
