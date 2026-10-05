"""Companion's read interface for other domains.

Permissions are asked live, never copied: a copy could keep showing progress
after the learner withdrew permission (MOT-07 R6, MOT-06 R4 ex3).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.companion.models import MentorLink


async def shared_learner_ids(session: AsyncSession, mentor_id: uuid.UUID) -> set[uuid.UUID]:
    """Learners whose chosen mentor is `mentor_id` and who share progress with them now."""
    rows = await session.scalars(
        select(MentorLink.learner_id).where(MentorLink.mentor_id == mentor_id, MentorLink.share_progress.is_(True))
    )
    return set(rows)
