"""PLT-05 R6: what Learning keeps about one account, for «نزّل نسخة من بياناتي»."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.learning.models import LessonCompletion, ObjectiveMastery, UnitUnlock


async def export_user(session: AsyncSession, user_id: uuid.UUID) -> dict:
    completions = await session.scalars(
        select(LessonCompletion).where(LessonCompletion.user_id == user_id).order_by(LessonCompletion.lesson_id)
    )
    unlocks = await session.scalars(select(UnitUnlock.unit_id).where(UnitUnlock.user_id == user_id).order_by(UnitUnlock.unit_id))
    mastery = await session.scalars(
        select(ObjectiveMastery).where(ObjectiveMastery.user_id == user_id).order_by(ObjectiveMastery.objective_id)
    )
    return {
        "completed_lessons": [
            {"lesson": c.lesson_id, "first_completed_at": c.first_completed_at, "last_completed_at": c.last_completed_at, "times": c.times}
            for c in completions
        ],
        "units_opened_by_placement": list(unlocks),
        "objectives": [
            {
                "objective": m.objective_id,
                "estimate": round(m.p, 3),
                "seen": m.seen,
                "answered": m.answered,
                "last_answer_at": m.last_answer_at,
                "mastered_at": m.mastered_at,
                "checks_done": m.checks_done,
            }
            for m in mastery
        ],
    }
