"""PLT-05 R6: what Motivation keeps about one account. Anonymous events are
not linked to an account, so they are not part of it."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.motivation.models import Challenge, ChallengeCheck, EarnedBadge, EngagementState, LearningLog, StreakDay


async def export_user(session: AsyncSession, user_id: uuid.UUID) -> dict:
    days = await session.scalars(select(StreakDay.day).where(StreakDay.user_id == user_id).order_by(StreakDay.day))
    badges = await session.scalars(select(EarnedBadge).where(EarnedBadge.user_id == user_id).order_by(EarnedBadge.earned_at))
    log = await session.scalars(select(LearningLog).where(LearningLog.user_id == user_id).order_by(LearningLog.at))
    states = await session.scalars(select(EngagementState).where(EngagementState.user_id == user_id))
    checks = await session.scalars(select(ChallengeCheck.challenge_id).where(ChallengeCheck.user_id == user_id))
    set_by_me = await session.scalars(select(Challenge).where(Challenge.created_by == user_id).order_by(Challenge.created_at))
    return {
        "learning_days": list(days),
        "badges": [{"badge": b.badge_id, "earned_at": b.earned_at} for b in badges],
        "learning_log": [{"kind": e.kind, "item": e.item_id, "repeat": e.is_repeat, "day": e.day, "at": e.at} for e in log],
        "engagement": [{"status": s.status, "first_at": s.first_at, "last_at": s.last_at, "returned_at": s.returned_at} for s in states],
        "challenges_checked": [str(c) for c in checks],
        "challenges_set": [
            {"type": c.type, "target": c.target_id, "count": c.target_count, "text": c.text, "status": c.status, "created_at": c.created_at}
            for c in set_by_me
        ],
    }
