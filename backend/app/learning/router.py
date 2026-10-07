"""Learning API: the path's content (LRN-01) for one language."""

import re
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import FileResponse
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import select

from app.core import ratelimit
from app.core.config import get_settings
from app.core.deps import CurrentUser, OptionalUser, Session
from app.knowledge.review import published
from app.learning.content import build_content, store
from app.learning.models import LessonCompletion, ObjectiveMastery, UnitUnlock

router = APIRouter(prefix="/api", tags=["learning"])
PREVIEW_ROLES = ("team", "sharia_reviewer", "admin")


@router.get("/content")
async def content(
    session: Session, user: OptionalUser, response: Response, lang: Literal["ar", "en", "tl"] = "ar", preview: bool = False
) -> dict:
    if preview and not (user and any(user.has(r) for r in PREVIEW_ROLES)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "preview_requires_team")
    units_live = await published(session, "unit", lang)
    lessons_live = await published(session, "lesson", lang)
    # Guests cache it for offline use (the service worker revalidates); previews are personal.
    response.headers["Cache-Control"] = "private, no-store" if preview else "public, max-age=60"
    return build_content(lang, units_live, lessons_live, preview)


# --- Account copy of progress (PLT-02: guests keep progress on the device;
# signing in merges it into the account, never losing either side) ---------


class Completion(BaseModel):
    first: AwareDatetime
    last: AwareDatetime
    times: int = Field(ge=1, le=100_000)


class Mastery(BaseModel):
    p: float = Field(ge=0, le=1)
    seen: bool = False
    answered: bool = False
    lastAnswerAt: AwareDatetime | None = None
    masteredAt: AwareDatetime | None = None
    lastExerciseId: str | None = Field(default=None, max_length=24)
    checksDone: int = Field(default=0, ge=0, le=10)
    # LRN-04 R2: exercises already answered for this objective (review prefers an unseen one).
    seenExercises: list[Annotated[str, Field(max_length=24)]] = Field(default_factory=list, max_length=60)


class LearningSync(BaseModel):
    completed: dict[Annotated[str, Field(max_length=16)], Completion] = Field(default_factory=dict, max_length=500)
    unlockedUnits: list[Annotated[str, Field(max_length=8)]] = Field(default_factory=list, max_length=50)
    mastery: dict[Annotated[str, Field(max_length=24)], Mastery] = Field(default_factory=dict, max_length=2000)


async def _learning_of(session, user_id) -> LearningSync:
    comps = await session.scalars(select(LessonCompletion).where(LessonCompletion.user_id == user_id))
    unlocks = await session.scalars(select(UnitUnlock.unit_id).where(UnitUnlock.user_id == user_id))
    mast = await session.scalars(select(ObjectiveMastery).where(ObjectiveMastery.user_id == user_id))
    return LearningSync(
        completed={c.lesson_id: Completion(first=c.first_completed_at, last=c.last_completed_at, times=c.times) for c in comps},
        unlockedUnits=list(unlocks),
        mastery={
            m.objective_id: Mastery(
                p=m.p,
                seen=m.seen,
                answered=m.answered,
                lastAnswerAt=m.last_answer_at,
                masteredAt=m.mastered_at,
                lastExerciseId=m.last_exercise_id,
                checksDone=m.checks_done,
                seenExercises=list(m.seen_exercises or []),
            )
            for m in mast
        },
    )


@router.get("/me/learning")
async def get_learning(session: Session, user: CurrentUser) -> LearningSync:
    return await _learning_of(session, user.id)


# The account copy only ever holds ids of the path: an unknown lesson, unit or
# objective id is left out (never stored), so the copy cannot grow past the
# path itself whatever a client sends (security review 2026-10-07, A-M3).
LEARNING_WRITES_PER_MIN = 60  # the app saves at most once every 1.5 s


@router.put("/me/learning")
async def merge_learning(body: LearningSync, session: Session, user: CurrentUser) -> LearningSync:
    """Union of completions (earliest first, latest last, most times), union
    of unlocks, and per objective the state with the latest answer."""
    ratelimit.hit(f"learning-sync:{user.id}", LEARNING_WRITES_PER_MIN, 60)
    path = store()
    lessons, units, objectives = set(path.lessons), {u["id"] for u in path.units}, path.objective_ids()
    done = {c.lesson_id: c for c in await session.scalars(select(LessonCompletion).where(LessonCompletion.user_id == user.id))}
    unlocked = set(await session.scalars(select(UnitUnlock.unit_id).where(UnitUnlock.user_id == user.id)))
    mastery = {m.objective_id: m for m in await session.scalars(select(ObjectiveMastery).where(ObjectiveMastery.user_id == user.id))}
    for lid, c in body.completed.items():
        if lid not in lessons:
            continue
        row = done.get(lid)
        if row is None:
            session.add(
                LessonCompletion(user_id=user.id, lesson_id=lid, first_completed_at=c.first, last_completed_at=c.last, times=c.times)
            )
        else:
            row.first_completed_at = min(row.first_completed_at, c.first)
            row.last_completed_at = max(row.last_completed_at, c.last)
            row.times = max(row.times, c.times)
    for uid in (set(body.unlockedUnits) & units) - unlocked:
        session.add(UnitUnlock(user_id=user.id, unit_id=uid))
    epoch = datetime.min.replace(tzinfo=UTC)
    for oid, m in body.mastery.items():
        if oid not in objectives:
            continue
        row = mastery.get(oid)
        # Seen exercises are a union: answered on any device counts as seen (LRN-04 R2).
        seen = list(dict.fromkeys([*((row.seen_exercises or []) if row else []), *m.seenExercises]))[-60:]
        if row is not None and (row.last_answer_at or epoch) >= (m.lastAnswerAt or epoch):
            if seen != list(row.seen_exercises or []):
                row.seen_exercises = seen
            continue
        if row is None:
            row = ObjectiveMastery(user_id=user.id, objective_id=oid)
            session.add(row)
        row.p, row.seen, row.answered, row.last_answer_at = m.p, m.seen, m.answered, m.lastAnswerAt
        row.mastered_at, row.last_exercise_id, row.checks_done = m.masteredAt, m.lastExerciseId, m.checksDone
        row.seen_exercises = seen
    await session.commit()
    return await _learning_of(session, user.id)


# --- Step photos of team units (only images; never the unit files) -----------

_MEDIA = re.compile(r"^unit-\d{2}/images/[A-Za-z0-9._-]+\.(webp|png|jpg)$")


@router.get("/content/media/{path:path}")
async def content_media(path: str) -> FileResponse:
    if not _MEDIA.fullmatch(path) or ".." in path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    f = get_settings().content_dir / "units" / path
    if not f.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return FileResponse(f, headers={"Cache-Control": "public, max-age=604800"})
