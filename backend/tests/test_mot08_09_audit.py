"""MOT-08 R5/R6 and MOT-09 R1/R3/R4 examples (audit gaps)."""

from datetime import UTC, date, datetime, timedelta

from app.core.db import SessionLocal
from app.motivation.indicators import mentor_contact, return_series, understanding
from app.motivation.models import AnonEvent, DailySnapshot
from tests.conftest import auth, with_roles

T0 = datetime(2026, 10, 1, tzinfo=UTC)


def snap(day: date, statuses: dict[str, str]) -> DailySnapshot:
    counts: dict[str, int] = {}
    for s in statuses.values():
        counts[s] = counts.get(s, 0) + 1
    return DailySnapshot(day=day, counts=counts, transitions=statuses)


def answer(dev: str, objective: str, correct: bool, context: str = "lesson", day: date = T0.date(), seq: int | None = None) -> AnonEvent:
    return AnonEvent(
        install_id=dev, type="first_answer", objective_id=objective, context=context, correct=correct, day=day, seq=seq, created_at=T0
    )


# MOT-08 ---------------------------------------------------------------------


def test_mot08_r5_return_rate_series_puts_a_marker_between_before_and_after():
    d = date(2026, 10, 12)  # «إطلاق أوسمة الاستمرار»
    lapsed = {f"u:{i}": "lapsed" for i in range(50)}
    snaps = {
        d - timedelta(days=7): snap(d - timedelta(days=7), lapsed),
        d: snap(d, {**lapsed, **{f"u:{i}": "returning" for i in range(5)}}),
        d + timedelta(days=7): snap(
            d + timedelta(days=7), {**lapsed, **{f"u:{i}": "returning" for i in range(5, 14)}}
        ),  # 9 of the 45 still lapsed,
    }
    series = return_series(snaps, [d, d + timedelta(days=7)])
    assert series == [{"day": d, "rate": 0.1}, {"day": d + timedelta(days=7), "rate": 0.2}]


async def test_mot08_r5_indicators_carry_the_series_and_markers(client):
    team = await with_roles(client, "team-1", "team")
    today = datetime.now(UTC).date()
    assert (
        await client.post("/api/team/markers", json={"day": today.isoformat(), "label": "إطلاق أوسمة الاستمرار"}, headers=auth(team))
    ).status_code == 201
    body = (await client.get("/api/team/indicators?days=30", headers=auth(team))).json()
    assert len(body["return_series"]) == 31 and body["markers"][0]["label"] == "إطلاق أوسمة الاستمرار"


def test_mot08_r6_return_rate_with_and_without_mentor_contact():
    at_risk = {f"u:c{i}": "at_risk" for i in range(40)} | {f"u:n{i}": "at_risk" for i in range(60)}
    later = {f"u:c{i}": "active" for i in range(20)} | {f"u:n{i}": "active" for i in range(15)}
    out = mentor_contact(snap(date(2026, 10, 1), at_risk), [snap(date(2026, 10, 15), later)], {f"c{i}" for i in range(40)})
    assert out == {"contacted": 0.5, "not_contacted": 0.25}


def test_mot08_r6_three_contacted_is_not_enough_data():
    at_risk = {f"u:c{i}": "at_risk" for i in range(3)} | {f"u:n{i}": "at_risk" for i in range(60)}
    out = mentor_contact(snap(date(2026, 10, 1), at_risk), [], {"c0", "c1", "c2"})
    assert out == {"contacted": None, "not_contacted": None}


async def test_mot08_r6_without_the_companion_event_shows_not_enough_data(client):
    team = await with_roles(client, "team-1", "team")
    body = (await client.get("/api/team/indicators", headers=auth(team))).json()
    assert body["mentor_contact"] == {"contacted": None, "not_contacted": None}


# MOT-09 ---------------------------------------------------------------------

ORDER = [{"unit_id": "u1", "lessons": [{"lesson_id": "u1-l1", "objectives": ["o1", "o2"]}]}]


def test_mot09_r1_per_unit_first_answers_in_lesson_then_review():
    ev = []
    for i in range(10):
        ev.append(answer(f"d{i}", "o1", i < 4))
        ev.append(answer(f"d{i}", "o2", i < 5))
        ev.append(answer(f"d{i}", "o1", i < 8, "review", T0.date() + timedelta(days=1)))
        ev.append(answer(f"d{i}", "o2", i < 8, "review", T0.date() + timedelta(days=1)))
    assert understanding(ev, ORDER)["units"]["u1"] == {"lesson": 0.45, "review": 0.8}


def test_mot09_r3_mastery_counts_people_not_events():
    ev = [answer(f"d{i}", "o1", True) for i in range(20)]
    ev += [AnonEvent(install_id=f"d{i}", type="mastered", objective_id="o1", day=T0.date()) for i in range(5)]
    ev += [
        AnonEvent(install_id="d0", type="mastered", objective_id="o1", day=T0.date()) for _ in range(3)
    ]  # mastered, lost, mastered again
    out = understanding(ev, ORDER)
    assert out["mastery"]["o1"] == 0.25
    assert out["weakest"] == ["o1"]


def test_mot09_r4_random_fifth_is_compared_and_offline_card_text_is_not():
    ev: list[AnonEvent] = []
    for i in range(12):
        dev = f"a{i}"  # «لماذا؟» with the explanation, then a right answer
        ev.append(answer(dev, "o1", False, seq=1))
        ev.append(
            AnonEvent(install_id=dev, type="why_shown", shown="ai_explanation", objective_id="o1", day=T0.date(), seq=2, created_at=T0)
        )
        ev.append(answer(dev, "o1", True, "review", seq=3))
    for i in range(12):
        dev = f"h{i}"  # the random fifth: card text, then a wrong answer
        ev.append(AnonEvent(install_id=dev, type="why_shown", shown="card_holdout", objective_id="o1", day=T0.date(), seq=5, created_at=T0))
        ev.append(answer(dev, "o1", True, seq=4))  # before «لماذا؟» (same batch, same arrival time): not "next"
        ev.append(answer(dev, "o1", False, "review", seq=6))
    for i in range(12):
        dev = f"o{i}"  # offline: card text, not part of the experiment
        ev.append(AnonEvent(install_id=dev, type="why_shown", shown="card_only", objective_id="o1", day=T0.date(), seq=1, created_at=T0))
        ev.append(answer(dev, "o1", True, "review", seq=2))
    out = understanding(ev, ORDER)["why_experiment"]
    assert out == {"ai_explanation": 1.0, "card_holdout": 0.0, "difference": 1.0}


async def test_mot09_r4_events_carry_their_order(client):
    events = [
        {"type": "why_shown", "shown": "card_holdout", "objective_id": "o1", "seq": 7},
        {"type": "first_answer", "objective_id": "o1", "context": "review", "correct": True, "seq": 8},
    ]
    assert (await client.post("/api/events", json={"install_id": "dev-ordered-1", "events": events})).status_code == 202
    async with SessionLocal() as s:
        from sqlalchemy import select

        rows = list(await s.scalars(select(AnonEvent).order_by(AnonEvent.seq)))
    assert [(r.type, r.seq, r.shown) for r in rows] == [("why_shown", 7, "card_holdout"), ("first_answer", 8, None)]
