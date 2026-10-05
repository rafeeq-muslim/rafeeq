"""MOT-08 engagement indicators and MOT-09 understanding: one test per example."""

from datetime import UTC, date, datetime, timedelta

from app.core.db import SessionLocal
from app.motivation.indicators import period_rates, ratio, understanding
from app.motivation.models import AnonEvent, DailySnapshot
from tests.conftest import auth, register, with_roles


def snap(day: int, statuses: dict[str, str]) -> DailySnapshot:
    counts: dict[str, int] = {}
    for s in statuses.values():
        counts[s] = counts.get(s, 0) + 1
    return DailySnapshot(day=date(2026, 10, day), counts=counts, transitions=statuses)


def test_mot08_r3_active_share_from_todays_snapshot():
    assert ratio(120, 200) == 0.6


def test_mot08_r3_return_rate_over_the_period():
    start = snap(1, {**{f"l{i}": "lapsed" for i in range(50)}, **{f"a{i}": "active" for i in range(50)}})
    later = snap(15, {**{f"l{i}": "returning" for i in range(5)}, **{f"l{i}": "lapsed" for i in range(5, 50)}})
    assert period_rates(start, [later])["return"] == 0.1


def test_mot08_r6_fewer_than_ten_people_is_not_enough_data():
    assert ratio(2, 3) is None


async def test_mot08_r1_only_the_team_sees_indicators(client):
    learner = (await register(client, username="learner-1"))["access_token"]
    mentor = await with_roles(client, "mentor-1", "mentor")
    for token in (learner, mentor):
        assert (await client.get("/api/team/indicators", headers=auth(token))).status_code == 403
    team = await with_roles(client, "team-1", "team")
    r = await client.get("/api/team/indicators?days=30", headers=auth(team))
    assert r.status_code == 200 and "per_lesson" in r.json()["learning"]
    assert "install_id" not in r.text


async def test_mot08_r4_lessons_completed_per_lesson(client):
    today = datetime.now(UTC).date()
    async with SessionLocal() as s:
        s.add_all(AnonEvent(install_id=f"d{i}", type="lesson_completed", lesson_id="u1-l1", day=today) for i in range(100))
        s.add_all(AnonEvent(install_id=f"d{i}", type="lesson_completed", lesson_id="u2-l2", day=today) for i in range(40))
        await s.commit()
    team = await with_roles(client, "team-1", "team")
    per = (await client.get("/api/team/indicators", headers=auth(team))).json()["learning"]["per_lesson"]
    assert per == {"u1-l1": 100, "u2-l2": 40}


def test_mot09_r1_first_answers_in_lesson_then_review_a_day_later():
    t0 = datetime(2026, 10, 1, tzinfo=UTC)
    ev = []
    for i in range(20):
        ev.append(
            AnonEvent(
                install_id=f"d{i}", type="first_answer", objective_id="o1", context="lesson", correct=i < 9, day=t0.date(), created_at=t0
            )
        )
        ev.append(
            AnonEvent(
                install_id=f"d{i}",
                type="first_answer",
                objective_id="o1",
                context="review",
                correct=i < 16,
                day=(t0 + timedelta(days=1)).date(),
                created_at=t0 + timedelta(days=1),
            )
        )
    out = understanding(ev)["objectives"]["o1"]
    assert out == {"lesson": 0.45, "review": 0.8}


def test_mot09_r6_unit_with_four_people_shows_no_number():
    t0 = datetime(2026, 10, 1, tzinfo=UTC)
    ev = [
        AnonEvent(
            install_id=f"d{i}", type="first_answer", objective_id="u6-o1", context="lesson", correct=True, day=t0.date(), created_at=t0
        )
        for i in range(4)
    ]
    assert understanding(ev)["objectives"]["u6-o1"]["lesson"] is None
