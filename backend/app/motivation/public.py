"""Motivation's read interface for other domains.

ORG-01 needs a newly linked learner's engagement status once, at the moment
of linking; after that it follows EngagementStatusChanged like any other
domain. Only the status word leaves Motivation, never events or dates.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.motivation.models import EngagementState


async def current_status(session: AsyncSession, install_id: str | None, user_id: uuid.UUID | None = None) -> str | None:
    """MOT-07 status of this device, or of the account's most recently used device."""
    if install_id:
        st = await session.get(EngagementState, install_id)
        if st is not None:
            return st.status
    if user_id is not None:
        st = await session.scalar(
            select(EngagementState)
            .where(EngagementState.user_id == user_id, EngagementState.last_at.is_not(None))
            .order_by(EngagementState.last_at.desc())
            .limit(1)
        )
        if st is not None:
            return st.status
    return None
