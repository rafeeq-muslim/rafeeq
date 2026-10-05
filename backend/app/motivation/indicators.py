"""MOT-08 engagement indicators and MOT-09 understanding and AI impact.

Team only (R1); aggregate numbers, no names, no device ids, no per-user
rows, no filters by user, mentor or group. Rates come from the frozen daily
snapshots (MOT-08 R2). Any number built from fewer than 10 people is
replaced by `None` with reason "not_enough_data" (MOT-08 R6, MOT-09 R6).
"""

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import Session, require_role
from app.motivation.models import AnonEvent, DailySnapshot, ReleaseMarker
from app.motivation.router import RIYADH
from app.platform.models import User

router = APIRouter(prefix="/api/team", tags=["team"])
Team = Annotated[User, Depends(require_role("team"))]
MIN_PEOPLE = 10


def ratio(num: int, den: int, people: int | None = None) -> float | None:
    if den == 0 or (people if people is not None else den) < MIN_PEOPLE:
        return None
    return round(num / den, 4)


def period_rates(start: DailySnapshot | None, during: list[DailySnapshot]) -> dict:
    """Dropout: not lapsed at the start → lapsed during. Return: lapsed at the
    start → returning during (MOT-08 R3 definitions)."""
    if start is None:
        return {"dropout": None, "return": None}
    begin = start.transitions or {}
    not_lapsed = {k for k, s in begin.items() if s != "lapsed"}
    lapsed = {k for k, s in begin.items() if s == "lapsed"}
    became_lapsed = {k for snap in during for k, s in (snap.transitions or {}).items() if s == "lapsed"}
    came_back = {k for snap in during for k, s in (snap.transitions or {}).items() if s == "returning"}
    return {
        "dropout": ratio(len(not_lapsed & became_lapsed), len(not_lapsed)),
        "return": ratio(len(lapsed & came_back), len(lapsed)),
    }


@router.get("/indicators")
async def indicators(session: Session, _: Team, days: int = Query(default=7)) -> dict:
    if days not in (7, 30):  # MOT-08 R3: the last 7 and the last 30 days
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "days_must_be_7_or_30")
    today = datetime.now(UTC).astimezone(RIYADH).date()
    since = today - timedelta(days=days)
    snaps = list(await session.scalars(select(DailySnapshot).where(DailySnapshot.day >= since).order_by(DailySnapshot.day)))
    latest = snaps[-1] if snaps else None
    users = sum((latest.counts or {}).values()) if latest else 0
    counts = latest.counts if latest else {}
    rates = period_rates(snaps[0] if snaps else None, snaps[1:])

    events = list(await session.scalars(select(AnonEvent).where(AnonEvent.day >= since)))
    by_day: Counter[date] = Counter(e.day for e in events if e.type == "lesson_completed")
    per_lesson: Counter[str] = Counter(e.lesson_id for e in events if e.type == "lesson_completed" and e.lesson_id)
    units_done: Counter[str] = Counter(e.unit_id for e in events if e.type == "unit_completed" and e.unit_id)
    markers = list(await session.scalars(select(ReleaseMarker).where(ReleaseMarker.day >= since).order_by(ReleaseMarker.day)))

    return {
        "days": days,
        "snapshot_day": latest.day if latest else None,
        "users": users,
        "counts": counts,
        "rates": {
            "active": ratio(counts.get("active", 0), users),
            "at_risk": ratio(counts.get("at_risk", 0), users),
            **rates,
            "mentor_contact": None,  # MOT-08 R6: needs CMP contact events; shown as not enough data until then
        },
        "learning": {
            "lessons_per_day": [{"day": d, "count": by_day.get(d, 0)} for d in (since + timedelta(days=i) for i in range(days + 1))],
            "per_lesson": dict(sorted(per_lesson.items())),
            "units_completed": dict(sorted(units_done.items())),
            "opted_out": sum(1 for e in events if e.type == "opt_out"),
        },
        "markers": [{"day": m.day, "label": m.label} for m in markers],
        "understanding": understanding(events),
    }


def understanding(events: list[AnonEvent]) -> dict:
    """MOT-09 R1-R5 from anonymous first answers (install ids only link a
    device's own events; nothing leaves this function per device)."""
    answers = sorted(
        (e for e in events if e.type == "first_answer" and e.objective_id), key=lambda e: e.created_at or datetime.min.replace(tzinfo=UTC)
    )
    lesson: dict[str, list[tuple[bool, str | None]]] = defaultdict(list)
    review: dict[str, list[tuple[bool, str | None]]] = defaultdict(list)
    first_lesson_day: dict[tuple[str | None, str], date] = {}
    for e in answers:
        key = (e.install_id, e.objective_id or "")
        if e.context == "lesson":
            lesson[e.objective_id or ""].append((bool(e.correct), e.install_id))
            first_lesson_day.setdefault(key, e.day)
        elif e.context == "review" and key in first_lesson_day and e.day > first_lesson_day[key]:
            review[e.objective_id or ""].append((bool(e.correct), e.install_id))
            first_lesson_day[key] = date.max  # only the first review counts

    def rate(rows: list[tuple[bool, str | None]]) -> float | None:
        people = len({i for _, i in rows if i})
        return ratio(sum(c for c, _ in rows), len(rows), people)

    objectives = {o: {"lesson": rate(lesson[o]), "review": rate(review.get(o, []))} for o in sorted(lesson)}

    placement = Counter(e.value for e in events if e.type == "placement_done")
    skipped = sum(1 for e in events if e.type == "placement_skipped")
    mastered = Counter(e.objective_id for e in events if e.type == "mastered" and e.objective_id)
    answered_people = {o: len({i for _, i in lesson[o] if i}) for o in lesson}
    mastery = {o: ratio(mastered.get(o, 0), answered_people[o]) for o in lesson}
    weakest = sorted((v, o) for o, v in mastery.items() if v is not None)[:5]

    # R4: next first answer on the same objective after "Why?", by what was shown.
    why = [e for e in events if e.type == "why_shown" and e.objective_id]
    groups: dict[str, list[bool]] = {"ai_explanation": [], "card_only": []}
    for w in why:
        after = next(
            (
                a
                for a in answers
                if a.install_id == w.install_id and a.objective_id == w.objective_id and (a.created_at or w.created_at) > w.created_at
            ),
            None,
        )
        if after is not None and w.shown in groups:
            groups[w.shown].append(bool(after.correct))
    experiment = {k: ratio(sum(v), len(v)) for k, v in groups.items()}

    shown = sum(1 for e in events if e.type == "guide_shown")
    followed = sum(1 for e in events if e.type == "guide_followed")
    quick = [e for e in answers if e.context == "quick_check"]
    return {
        "objectives": objectives,
        "placement": {"distribution": {str(k): v for k, v in sorted(placement.items(), key=lambda kv: kv[0] or 0)}, "skipped": skipped},
        "mastery": mastery,
        "weakest": [o for _, o in weakest],
        "why_experiment": experiment,
        "guide_followed": ratio(followed, shown),
        "quick_check_correct": ratio(sum(bool(e.correct) for e in quick), len(quick)),
    }


class MarkerIn(BaseModel):
    day: date
    label: str = Field(min_length=2, max_length=120)


@router.post("/markers", status_code=201)
async def add_marker(body: MarkerIn, session: Session, _: Team) -> dict:
    """MOT-08 R5: a dated release marker on the indicators."""
    session.add(ReleaseMarker(day=body.day, label=body.label.strip()))
    await session.commit()
    return {"ok": True}
