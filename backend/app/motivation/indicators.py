"""MOT-08 engagement indicators and MOT-09 understanding and AI impact.

Team only (R1); aggregate numbers, no names, no device ids, no per-user
rows, no filters by user, mentor or group. Rates come from the frozen daily
snapshots (MOT-08 R2). Any number built from fewer than 10 people is
replaced by `None` with reason "not_enough_data" (MOT-08 R6, MOT-09 R6).
Lessons, units and objectives are listed in path order, read through
Learning's interface (app.learning.public).

The anonymous events of the period are never held in memory together: they
are read once, a chunk at a time, grouped by device, and only running totals
are kept (`Figures`).
"""

from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core import ratelimit
from app.core.deps import Session, require_role
from app.core.events import OutboxEvent, payload_text
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
# Rows fetched from the database at a time while the events are read.
CHUNK = 1000
# The page asks for the 7-day and the 30-day view; the figures change once a day.
READS_PER_MIN = 30
EVENT_TYPES = (
    "lesson_completed",
    "unit_completed",
    "opt_out",
    "first_answer",
    "mastered",
    "why_shown",
    "guide_shown",
    "guide_followed",
    "placement_done",
    "placement_skipped",
)
EVENT_COLUMNS = (
    AnonEvent.id,
    AnonEvent.install_id,
    AnonEvent.type,
    AnonEvent.lesson_id,
    AnonEvent.unit_id,
    AnonEvent.objective_id,
    AnonEvent.correct,
    AnonEvent.context,
    AnonEvent.shown,
    AnonEvent.is_repeat,
    AnonEvent.value,
    AnonEvent.day,
    AnonEvent.seq,
    AnonEvent.created_at,
)


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


def _sort_key(e) -> tuple:
    """A device's own order: its event counter (MOT-09 R4), then arrival."""
    return (e.seq if e.seq is not None else float("inf"), e.id or 0, e.created_at or _MIN_TIME)


def _after(a, w) -> bool:
    if a.seq is not None and w.seq is not None:
        return a.seq > w.seq
    if a.id is not None and w.id is not None:
        return a.id > w.id
    return (a.created_at or _MIN_TIME) > (w.created_at or _MIN_TIME)


def _device_order(e) -> tuple:
    """The order `Figures` reads events in: a device's events together (those
    unlinked by an opt-out last), each day in the device's own order."""
    return (e.install_id is None, e.install_id or "", e.day or date.min, *_sort_key(e))


def events_in_order(since: date):
    """The period's events as plain rows, in the order of `_device_order`."""
    return (
        select(*EVENT_COLUMNS)
        .where(AnonEvent.day >= since, AnonEvent.type.in_(EVENT_TYPES))
        .order_by(AnonEvent.install_id.asc().nulls_last(), AnonEvent.day, AnonEvent.seq.asc().nulls_last(), AnonEvent.id)
    )


class Figures:
    """MOT-08 R4 and MOT-09 R1-R6 from anonymous events, in one pass.

    Events come in `_device_order`. What is kept between events is one
    device's own answers (dropped when the next device starts) and totals per
    lesson, unit, objective and day: never the events, never a list of devices.
    Install ids only link a device's own events; none leaves this class."""

    def __init__(self, order: list[dict] | None = None):
        self.order = order or []
        self.unit_objectives = {u["unit_id"]: [o for lsn in u["lessons"] for o in lsn["objectives"]] for u in self.order}
        self.units_of: dict[str, set[str]] = defaultdict(set)
        for unit_id, objs in self.unit_objectives.items():
            for o in objs:
                self.units_of[o].add(unit_id)
        # Security review 2026-10-07 (B-L14): an objective id is whatever the
        # sender typed; with the path at hand, only its own objectives count
        # and are listed (objectives, mastery, weakest), never an id as typed.
        self.in_path = set(self.units_of) if self.order else None
        self.by_day: Counter[date] = Counter()
        self.opted_out = 0
        # People (not events) per lesson or unit. Events unlinked by an opt-out
        # have no device id; each first completion among them counts as one.
        self.completed: dict[str, Counter[str]] = {"lesson_completed": Counter(), "unit_completed": Counter()}
        # First answers per objective, in the lesson and in the first review
        # on a later day: answers, correct ones, people.
        self.lesson_n: Counter[str] = Counter()
        self.lesson_ok: Counter[str] = Counter()
        self.lesson_people: Counter[str] = Counter()
        self.review_n: Counter[str] = Counter()
        self.review_ok: Counter[str] = Counter()
        self.review_people: Counter[str] = Counter()
        self.unit_lesson_people: Counter[str] = Counter()
        self.unit_review_people: Counter[str] = Counter()
        self.answered: Counter[str] = Counter()
        self.mastered: Counter[str] = Counter()
        self.why_n: Counter[str] = Counter()
        self.why_ok: Counter[str] = Counter()
        self.why_people: Counter[str] = Counter()
        self.guide_n = self.guide_people = self.followed_n = 0
        self.quick_n = self.quick_ok = self.quick_people = 0
        self.placement_cells: Counter[str] = Counter()
        self._started = False
        self._device: str | None = None
        self._reset_device()

    def _reset_device(self) -> None:
        self._completed: set[tuple[str, str]] = set()
        self._first_lesson_day: dict[str, date] = {}
        self._lesson_objs: set[str] = set()
        self._review_objs: set[str] = set()
        self._answered: set[str] = set()
        self._mastered: set[str] = set()
        self._answers: dict[str, list] = defaultdict(list)
        self._whys: list = []
        self._guide = self._quick = False
        self._placement = None

    def add(self, e) -> None:
        if not self._started or e.install_id != self._device:
            self.close()
            self._started, self._device = True, e.install_id
        device = e.install_id
        if e.type in self.completed:
            if e.type == "lesson_completed":
                self.by_day[e.day] += 1
            key = e.lesson_id if e.type == "lesson_completed" else e.unit_id
            if key and device:
                self._completed.add((e.type, key))
            elif key and not e.is_repeat:
                self.completed[e.type][key] += 1
        elif e.type == "opt_out":
            self.opted_out += 1
        elif self.in_path is not None and e.objective_id and e.objective_id not in self.in_path:
            return  # B-L14: not an objective of the path
        elif e.type == "first_answer" and e.objective_id:
            self._answer(e)
        elif e.type == "mastered" and e.objective_id and device:
            self._mastered.add(e.objective_id)
        elif e.type == "why_shown" and e.objective_id and device and e.shown in ("ai_explanation", "card_holdout"):
            self._whys.append(e)
        elif e.type == "guide_shown":
            self.guide_n += 1
            self._guide = True
        elif e.type == "guide_followed":
            self.followed_n += 1
        elif e.type in ("placement_done", "placement_skipped") and device:
            self._placement = e  # the last outcome counts

    def _answer(self, e) -> None:
        o, device = e.objective_id, e.install_id
        if e.context == "lesson":
            self.lesson_n[o] += 1
            self.lesson_ok[o] += bool(e.correct)
            self._lesson_objs.add(o)
            self._first_lesson_day.setdefault(o, e.day)
        elif e.context == "review" and o in self._first_lesson_day and e.day > self._first_lesson_day[o]:
            self.review_n[o] += 1
            self.review_ok[o] += bool(e.correct)
            self._review_objs.add(o)
            self._first_lesson_day[o] = date.max  # only the first review counts
        elif e.context == "quick_check":
            self.quick_n += 1
            self.quick_ok += bool(e.correct)
            self._quick = True
        if device:
            self._answered.add(o)
            self._answers[o].append(e)

    def close(self) -> None:
        """The current device's events are all in: count it where it belongs.
        Events without a device id add to the answer totals, never to people."""
        if self._started and self._device:
            for type_, key in self._completed:
                self.completed[type_][key] += 1
            for objs, per_objective, per_unit in (
                (self._lesson_objs, self.lesson_people, self.unit_lesson_people),
                (self._review_objs, self.review_people, self.unit_review_people),
            ):
                for o in objs:
                    per_objective[o] += 1
                for unit_id in {u for o in objs for u in self.units_of.get(o, ())}:
                    per_unit[unit_id] += 1
            for o in self._answered:
                self.answered[o] += 1
                self.mastered[o] += o in self._mastered
            # R4: the next first answer on the same objective after «لماذا؟», by
            # what was shown: the explanation, or the card text in the random
            # fifth. Card text shown because the device was offline or the call
            # failed is not part of the experiment.
            shown_to = set()
            for w in self._whys:
                later = [a for a in self._answers.get(w.objective_id, []) if _after(a, w)]
                if later:
                    self.why_n[w.shown] += 1
                    self.why_ok[w.shown] += bool(min(later, key=_sort_key).correct)
                    shown_to.add(w.shown)
            for shown in shown_to:
                self.why_people[shown] += 1
            self.guide_people += self._guide
            self.quick_people += self._quick
            if self._placement is not None:
                p = self._placement
                self.placement_cells["skipped" if p.type == "placement_skipped" else str(p.value or 0)] += 1
        self._started = False
        self._reset_device()

    def learning(self) -> dict:
        """MOT-08 R4: people per lesson in path order (so the team sees where
        most stop), and people per unit.

        Security review 2026-10-07 (B-L14): anonymous events come from any device
        without sign-in, so a lesson or unit id is whatever the sender typed. Only
        ids that are in the path are shown; anything else is left out, never
        listed to the team as typed."""
        lessons, units = self.completed["lesson_completed"], self.completed["unit_completed"]
        per_lesson = [
            {"lesson_id": lesson["lesson_id"], "unit_id": u["unit_id"], "people": lessons.get(lesson["lesson_id"], 0)}
            for u in self.order
            for lesson in u["lessons"]
        ]
        units_completed = [{"unit_id": u["unit_id"], "people": units.get(u["unit_id"], 0)} for u in self.order]
        return {"per_lesson": per_lesson, "units_completed": units_completed}

    def understanding(self) -> dict:
        objectives = {
            o: {
                "lesson": ratio(self.lesson_ok[o], self.lesson_n[o], self.lesson_people[o]),
                "review": ratio(self.review_ok[o], self.review_n[o], self.review_people[o]),
            }
            for o in sorted(self.lesson_n)
        }
        # R1: the same two numbers per unit, over all its objectives' first answers.
        units: dict[str, dict] = {}
        for unit_id, objs in self.unit_objectives.items():
            if any(o in self.lesson_n for o in objs):
                units[unit_id] = {
                    "lesson": ratio(
                        sum(self.lesson_ok[o] for o in objs), sum(self.lesson_n[o] for o in objs), self.unit_lesson_people[unit_id]
                    ),
                    "review": ratio(
                        sum(self.review_ok[o] for o in objs), sum(self.review_n[o] for o in objs), self.unit_review_people[unit_id]
                    ),
                }
        # R3: people who reached "mastered" among the people who answered it.
        mastery = {o: ratio(self.mastered[o], self.answered[o]) for o in sorted(self.answered)}
        weakest = sorted((v, o) for o, v in mastery.items() if v is not None)[:5]
        experiment: dict[str, float | None] = {
            k: ratio(self.why_ok[k], self.why_n[k], self.why_people[k]) for k in ("ai_explanation", "card_holdout")
        }
        ai, hold = experiment["ai_explanation"], experiment["card_holdout"]
        experiment["difference"] = round(ai - hold, 4) if ai is not None and hold is not None else None
        return {
            "objectives": objectives,
            "units": units,
            "placement": placement_figures(self.placement_cells),
            "mastery": mastery,
            "weakest": [o for _, o in weakest],
            "why_experiment": experiment,
            # R5 rates count messages and answers; R6 counts the people behind them.
            "guide_followed": ratio(self.followed_n, self.guide_n, self.guide_people),
            "quick_check_correct": ratio(self.quick_ok, self.quick_n, self.quick_people),
        }


def figures_of(events: Iterable, order: list[dict] | None = None) -> Figures:
    """`Figures` for events already in memory (a small set: tests, a script)."""
    out = Figures(order)
    for e in sorted(events, key=_device_order):
        out.add(e)
    out.close()
    return out


def understanding(events: Iterable, order: list[dict] | None = None) -> dict:
    """MOT-09 R1-R5 from anonymous first answers."""
    return figures_of(events, order).understanding()


def learning_by_path(events: Iterable, order: list[dict]) -> dict:
    """MOT-08 R4 for a list in memory."""
    return figures_of(events, order).learning()


@router.get("/indicators")
async def indicators(session: Session, me: Team, days: int = Query(default=7)) -> dict:
    if days not in (7, 30):  # MOT-08 R3: the last 7 and the last 30 days
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "days_must_be_7_or_30")
    ratelimit.hit(f"team-indicators:{me.id}", READS_PER_MIN, 60)
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
        select(payload_text("user_id")).where(
            OutboxEvent.name == CONTACT_EVENT, OutboxEvent.created_at >= datetime.combine(since, datetime.min.time(), RIYADH)
        )
    )
    contacted = {c for c in contacts if c}

    figures = Figures(path_order())
    rows = await session.stream(events_in_order(since).execution_options(yield_per=CHUNK))
    async for chunk in rows.partitions():
        for e in chunk:
            figures.add(e)
    figures.close()
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
        },
        "return_series": return_series({s.day: s for s in all_snaps}, [since + timedelta(days=i) for i in range(days + 1)]),
        "mentor_contact": mentor_contact(snaps[0] if snaps else None, snaps[1:], contacted),
        "learning": {
            "lessons_per_day": [
                {"day": d, "count": figures.by_day.get(d, 0)} for d in (since + timedelta(days=i) for i in range(days + 1))
            ],
            **figures.learning(),
            "opted_out": figures.opted_out,
        },
        "markers": [{"day": m.day, "label": m.label} for m in markers],
        "understanding": figures.understanding(),
    }


def placement_figures(cells: Counter[str]) -> dict:
    """R2 with R6: people per number of units passed, and people who skipped.

    `cells` counts each device once, by its last placement outcome (done or
    skipped), so the buckets and «skipped» are one partition of the people.
    Events unlinked by an opt-out are left out: they cannot be counted as people.
    Fewer than 10 people in all hides everything; a bucket under 10 is hidden
    (None), and if the hidden buckets add up to 1-9 people the next smallest
    bucket is hidden too, so no small bucket can be worked out from the others
    (complementary suppression, as in ORG-03)."""
    if sum(cells.values()) < MIN_PEOPLE:
        return {"distribution": {}, "skipped": None}
    hidden = {k for k, n in cells.items() if n < MIN_PEOPLE}
    while 0 < sum(cells[k] for k in hidden) < MIN_PEOPLE and len(hidden) < len(cells):
        hidden.add(min((k for k in cells if k not in hidden), key=lambda k: (cells[k], k)))
    shown = {k: (None if k in hidden else n) for k, n in cells.items()}
    skipped = shown.pop("skipped", 0)
    return {"distribution": dict(sorted(shown.items(), key=lambda kv: int(kv[0]))), "skipped": skipped}


class MarkerIn(BaseModel):
    day: date
    label: str = Field(min_length=2, max_length=120)


@router.post("/markers", status_code=201)
async def add_marker(body: MarkerIn, session: Session, _: Team) -> dict:
    """MOT-08 R5: a dated release marker on the indicators."""
    session.add(ReleaseMarker(day=body.day, label=body.label.strip()))
    await session.commit()
    return {"ok": True}
