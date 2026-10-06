"""Learning's read interface for other domains (docs/domains.md: a domain
owns its data; others ask through here instead of reading its files or
tables).

- `path_order()`: units and their lessons in path order, with each lesson's
  objectives (for MOT-08 R4 and MOT-09 R1/R3, which report per lesson,
  unit and objective).
- `is_live()`: whether a lesson or unit is shown to learners in at least
  one language (merged and not withdrawn by the Sharia reviewer), for the
  MOT-06 R1 challenge target.
"""

from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge.review import published
from app.learning.content import LANGS, store


def path_order() -> list[dict]:
    """[{unit_id, lessons: [{lesson_id, objectives: [ids]}]}] in path order."""
    s = store()
    out = []
    for u in s.units:
        lessons = []
        for lid in u.get("lessons", []):
            lesson = s.lessons.get(lid)
            if lesson is not None:
                lessons.append({"lesson_id": lid, "objectives": [o["id"] for o in lesson.get("objectives", [])]})
        out.append({"unit_id": u["id"], "lessons": lessons})
    return out


async def is_live(session: AsyncSession, kind: Literal["lesson", "unit"], item_id: str) -> bool:
    for lang in LANGS:
        if item_id in await published(session, kind, lang):
            return True
    return False
