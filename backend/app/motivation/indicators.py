"""MOT-08 engagement indicators and MOT-09 understanding and AI impact.

Team only (R1); aggregate numbers, no names, no device ids, no per-user
rows, no filters by user, mentor or group. Rates come from the frozen daily
snapshots (MOT-08 R2). Any number built from fewer than 10 people is
replaced by `None` with reason "not_enough_data" (MOT-08 R6, MOT-09 R6).
Lessons, units and objectives are listed in path order, read through
Learning's interface (app.learning.public).
"""

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import Session, require_role
from app.core.events import OutboxEvent
from app.learning.public import path_order
from app.motivation.models import AnonEvent, DailySnapshot, ReleaseMarker
from app.motivation.router import RIYADH
from app.platform.models import User

router = APIRouter(prefix="/api/team", tags=["team"])
Team = Annotated[User, Depends(require_role("team"))]
MIN_PEOPLE = 10
# MOT-08 R6: Companion publishes it when a learner's own mentor writes to them
# (app/companion/contact.py; at most one per learner per Riyadh day).
CONTACT_EVENT = "MentorContacted"
_MIN_TIME = datetime.min.replace(tzinfo=UTC)


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


def return_series(snaps: dict[date, DailySnapshot], days: list[date], window: int = 7) -> list[dict]:
    """MOT-08 R5: the return rate day by day (each point covers the `window`
    days before it), so a release marker sits between the numbers before and
    after it."""
    out = []
    for d in days:
        start = snaps.get(d - timedelta(days=window))
        during = [snaps[x] for x in (d - timedelta(days=i) for i in range(window - 1, -1, -1)) if x in snaps]
        out.append({"day": d, "rate": period_rates(start, during)["return"]})
    return out


def mentor_contact(start: DailySnapshot | None, during: list[DailySnapshot], contacted_users: set[str]) -> dict:
    """MOT-08 R6: among those at risk at the start of the period, the share
    back to active (or returning) during it, for those whose mentor got in
    touch and for the others. Both groups need 10 people, or neither shows."""
    empty = {"contacted": None, "not_contacted": None}
    if start is None:
        return empty
    at_risk = {k for k, s in (start.transitions or {}).items() if s == "at_risk"}
    back = {k for snap in during for k, s in (snap.transitions or {}).items() if s in ("active", "returning")}
    contacted = {k for k in at_risk if k.startswith("u:") and k[2:] in contacted_users}
    others = at_risk - contacted
    if len(contacted) < MIN_PEOPLE or len(others) < MIN_PEOPLE:
        return empty
    return {"contacted": ratio(len(contacted & back), len(contacted)), "not_contacted": ratio(len(others & back), len(others))}


def people_per(events: list[AnonEvent], type_: str, attr: str) -> Counter[str]:
    """People (not events) per lesson or unit. Events unlinked by an opt-out
    have no device id; each first completion among them counts as one."""
    linked: dict[str, set[str]] = defaultdict(set)
    unlinked: Counter[str] = Counter()
    for e in events:
        key = getattr(e, attr)
        if e.type != type_ or not key:
            continue
        if e.install_id:
            linked[key].add(e.install_id)
        elif not e.is_repeat:
            unlinked[key] += 1
    return Counter({k: len(v) for k, v in linked.items()}) + unlinked


def learning_by_path(events: list[AnonEvent], order: list[dict]) -> dict:
    """MOT-08 R4: people per lesson in path order (so the team sees where
    most stop), and people per unit."""
    lessons = people_per(events, "lesson_completed", "lesson_id")
    units = people_per(events, "unit_completed", "unit_id")
    per_lesson = [
        {"lesson_id": lesson["lesson_id"], "unit_id": u["unit_id"], "people": lessons.get(lesson["lesson_id"], 0)}
        for u in order
        for lesson in u["lessons"]
    ]
    known = {r["lesson_id"] for r in per_lesson}
    per_lesson += [{"lesson_id": k, "unit_id": None, "people": n} for k, n in sorted(lessons.items()) if k not in known]
    units_completed = [{"unit_id": u["unit_id"], "people": units.get(u["unit_id"], 0)} for u in order]
    known_units = {r["unit_id"] for r in units_completed}
    units_completed += [{"unit_id": k, "people": n} for k, n in sorted(units.items()) if k not in known_units]
    return {"per_lesson": per_lesson, "units_completed": units_completed}


@router.get("/indicators")
async def indicators(session: Session, _: Team, days: int = Query(default=7)) -> dict:
    if days not in (7, 30):  # MOT-08 R3: the last 7 and the last 30 days
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "days_must_be_7_or_30")
    today = datetime.now(UTC).astimezone(RIYADH).date()
    since = today - timedelta(days=days)
    all_snaps = list(
        await session.scalars(select(DailySnapshot).where(DailySnapshot.day >= since - timedelta(days=7)).order_by(DailySnapshot.day))
    )
    snaps = [s for s in all_snaps if s.day >= since]
    latest = snaps[-1] if snaps else None
    users = sum((latest.counts or {}).values()) if latest else 0
    counts = latest.counts if latest else {}
    rates = period_rates(snaps[0] if snaps else None, snaps[1:])
    contacts = await session.scalars(
        select(OutboxEvent.payload["user_id"].astext).where(
            OutboxEvent.name == CONTACT_EVENT, OutboxEvent.created_at >= datetime.combine(since, datetime.min.time(), RIYADH)
        )
    )

    events = list(await session.scalars(select(AnonEvent).where(AnonEvent.day >= since)))
    by_day: Counter[date] = Counter(e.day for e in events if e.type == "lesson_completed")
    markers = list(await session.scalars(select(ReleaseMarker).where(ReleaseMarker.day >= since).order_by(ReleaseMarker.day)))
    order = path_order()

    return {
        "days": days,
        "snapshot_day": latest.day if latest else None,
        "users": users,
        "counts": counts,
        "rates": {
            "active": ratio(counts.get("active", 0), users),
            "at_risk": ratio(counts.get("at_risk", 0), users),
            **rates,
        },
        "return_series": return_series({s.day: s for s in all_snaps}, [since + timedelta(days=i) for i in range(days + 1)]),
        "mentor_contact": mentor_contact(snaps[0] if snaps else None, snaps[1:], {c for c in contacts if c}),
        "learning": {
            "lessons_per_day": [{"day": d, "count": by_day.get(d, 0)} for d in (since + timedelta(days=i) for i in range(days + 1))],
            **learning_by_path(events, order),
            "opted_out": sum(1 for e in events if e.type == "opt_out"),
        },
        "markers": [{"day": m.day, "label": m.label} for m in markers],
        "understanding": understanding(events, order),
    }


def _sort_key(e: AnonEvent) -> tuple:
    """A device's own order: its event counter (MOT-09 R4), then arrival."""
    return (e.seq if e.seq is not None else float("inf"), e.id or 0, e.created_at or _MIN_TIME)


def _after(a: AnonEvent, w: AnonEvent) -> bool:
    if a.seq is not None and w.seq is not None:
        return a.seq > w.seq
    if a.id is not None and w.id is not None:
        return a.id > w.id
    return (a.created_at or _MIN_TIME) > (w.created_at or _MIN_TIME)


def understanding(events: list[AnonEvent], order: list[dict] | None = None) -> dict:
    """MOT-09 R1-R5 from anonymous first answers (install ids only link a
    device's own events; nothing leaves this function per device)."""
    answers = sorted((e for e in events if e.type == "first_answer" and e.objective_id), key=lambda e: (e.day, *_sort_key(e)))
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

    # R1: the same two numbers per unit, over all its objectives' first answers.
    units: dict[str, dict] = {}
    for u in order or []:
        objs = [o for lsn in u["lessons"] for o in lsn["objectives"]]
        if any(o in lesson for o in objs):
            units[u["unit_id"]] = {
                "lesson": rate([r for o in objs for r in lesson.get(o, [])]),
                "review": rate([r for o in objs for r in review.get(o, [])]),
            }

    placement = Counter(e.value for e in events if e.type == "placement_done")
    skipped = sum(1 for e in events if e.type == "placement_skipped")

    # R3: people who reached "mastered" among the people who answered it.
    answered: dict[str, set[str]] = defaultdict(set)
    mastered: dict[str, set[str]] = defaultdict(set)
    for e in events:
        if e.objective_id and e.install_id:
            if e.type == "first_answer":
                answered[e.objective_id].add(e.install_id)
            elif e.type == "mastered":
                mastered[e.objective_id].add(e.install_id)
    mastery = {o: ratio(len(mastered[o] & answered[o]), len(answered[o])) for o in sorted(answered)}
    weakest = sorted((v, o) for o, v in mastery.items() if v is not None)[:5]

    # R4: the next first answer on the same objective after «لماذا؟», by what
    # was shown: the explanation, or the card text in the random fifth. Card
    # text shown because the device was offline or the call failed is not
    # part of the experiment.
    by_device: dict[tuple[str, str], list[AnonEvent]] = defaultdict(list)
    for a in answers:
        if a.install_id:
            by_device[(a.install_id, a.objective_id or "")].append(a)
    groups: dict[str, list[bool]] = {"ai_explanation": [], "card_holdout": []}
    people: dict[str, set[str]] = {"ai_explanation": set(), "card_holdout": set()}
    for w in events:
        if w.type != "why_shown" or not w.objective_id or not w.install_id or w.shown not in groups:
            continue
        later = [a for a in by_device.get((w.install_id, w.objective_id), []) if _after(a, w)]
        if later:
            groups[w.shown].append(bool(min(later, key=_sort_key).correct))
            people[w.shown].add(w.install_id)
    experiment: dict[str, float | None] = {k: ratio(sum(v), len(v), len(people[k])) for k, v in groups.items()}
    ai, hold = experiment["ai_explanation"], experiment["card_holdout"]
    experiment["difference"] = round(ai - hold, 4) if ai is not None and hold is not None else None

    shown = sum(1 for e in events if e.type == "guide_shown")
    followed = sum(1 for e in events if e.type == "guide_followed")
    quick = [e for e in answers if e.context == "quick_check"]
    return {
        "objectives": objectives,
        "units": units,
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
