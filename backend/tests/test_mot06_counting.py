"""MOT-06 counting fixes (audit gaps): an approved target (R1), learning
days keep their own date and the learner's local day (R2)."""

from datetime import UTC, datetime, timedelta

from tests.cmp_helpers import person
from tests.conftest import withdraw
from tests.test_mot06_challenges import brothers, learn, lesson, set_challenge, view


async def test_mot06_r1_lesson_or_unit_target_must_be_approved(client):
    mentor, _, g = await brothers(client, 1)
    for body in ({"type": "lesson", "target_id": "no-such-lesson"}, {"type": "unit", "target_id": "u99"}):
        r = await client.post(f"/api/groups/{g['id']}/challenge", json=body, headers=mentor.h)
        assert (r.status_code, r.json()["detail"]) == (422, "target_not_approved")
    seen = await set_challenge(client, mentor, g, type="unit", target_id="u2")
    assert seen["target_id"] == "u2"


async def test_mot06_r1_a_lesson_withdrawn_by_the_reviewer_is_not_a_target(client):
    mentor, _, g = await brothers(client, 1)
    reviewer = await person(client, "muhannad-r", roles=("sharia_reviewer",))
    for lang in ("ar", "en", "tl"):
        await withdraw(client, reviewer.token, "lesson", "u2-l1", lang)
    r = await client.post(f"/api/groups/{g['id']}/challenge", json={"type": "lesson", "target_id": "u2-l1"}, headers=mentor.h)
    assert r.status_code == 422


async def test_mot06_r2_a_learning_day_copied_in_by_sign_in_keeps_its_date(client):
    mentor, (joseph,), g = await brothers(client, 1)
    await set_challenge(client, mentor, g, type="days_each", target_count=1)
    old = (datetime.now(UTC) - timedelta(days=10)).date().isoformat()
    await learn(client, joseph, {"kind": "day", "item_id": old})  # no `at`: an old day from the device's history
    assert (await view(client, joseph, g))["mine"] is False


async def test_mot06_r2_two_lessons_one_day_and_one_the_next_are_two_days(client):
    """Units count on the learner's local day and never add a day of their own."""
    mentor, (joseph,), g = await brothers(client, 1)
    await set_challenge(client, mentor, g, type="days_each", target_count=3)
    today = datetime.now(UTC).date()
    d1, d2 = (today - timedelta(days=1)).isoformat(), (today - timedelta(days=2)).isoformat()
    await learn(client, joseph, lesson("u2-l1", d1), lesson("u2-l2", d1), lesson("u2-l3", d2))
    await learn(client, joseph, {"kind": "unit", "item_id": "u2"})  # an older client: no local day sent
    await learn(client, joseph, {"kind": "unit", "item_id": "u3", "day": d1})
    assert (await view(client, joseph, g))["mine"] is False  # two learning days, not three
