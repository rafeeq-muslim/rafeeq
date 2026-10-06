"""MOT-03 milestone badges, server side: BadgeEarned (R1), once only (R2)
and the mentor's view with permission only (R6). Earning, naming (R3) and
the one-time announcement (R4) happen on the device and are tested in
frontend/src/app/motivation/motivation.test.tsx."""

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from tests.cmp_helpers import group_with, person

UNIT_BADGE = {"unit-u01": {"id": "unit-u01", "earnedAt": "2026-10-05T09:00:00Z"}}


async def choose(client, learner, mentor):
    await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en"]}, headers=learner.h)
    r = await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=learner.h)
    assert r.status_code == 200, r.text


async def earn(client, who, badges: dict) -> dict:
    r = await client.put("/api/me/motivation", json={"badges": badges}, headers=who.h)
    assert r.status_code == 200, r.text
    return r.json()


async def badge_events() -> list[dict]:
    async with SessionLocal() as s:
        return [e.payload for e in await s.scalars(select(OutboxEvent).where(OutboxEvent.name == "BadgeEarned"))]


async def test_mot03_r1_unit_badge_sends_badge_earned(client):
    joseph = await person(client, "joseph-1", gender="m")
    await earn(client, joseph, UNIT_BADGE)
    assert await badge_events() == [{"user_id": str(joseph.id), "badge_id": "unit-u01", "earned_at": "2026-10-05T09:00:00+00:00"}]


async def test_mot03_r1_only_unit_and_learning_day_badges_exist(client):
    joseph = await person(client, "joseph-1", gender="m")
    out = await earn(client, joseph, {"prayer-7": {"id": "prayer-7", "earnedAt": "2026-10-05T09:00:00Z"}})
    assert out["badges"] == {} and await badge_events() == []


async def test_mot03_r2_badge_is_earned_and_announced_once(client):
    joseph = await person(client, "joseph-1", gender="m")
    await earn(client, joseph, UNIT_BADGE)
    await earn(client, joseph, UNIT_BADGE)  # repeating the unit, or a second device merging
    assert len(await badge_events()) == 1


async def test_mot03_r6_mentor_sees_badge_when_shared(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    joseph = await person(client, "joseph-1", gender="m")
    await choose(client, joseph, abu)
    await client.put("/api/mentors/mine/share", json={"share": True}, headers=joseph.h)
    await earn(client, joseph, UNIT_BADGE)
    rows = (await client.get("/api/mentor/mentee-badges", headers=abu.h)).json()
    assert rows == [{"learner_id": str(joseph.id), "badges": [{"id": "unit-u01", "earnedAt": "2026-10-05T09:00:00Z"}]}]


async def test_mot03_r6_mentor_sees_nothing_without_permission(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    joseph = await person(client, "joseph-1", gender="m")
    await choose(client, joseph, abu)
    await earn(client, joseph, UNIT_BADGE)  # permission is off until he turns it on
    assert (await client.get("/api/mentor/mentee-badges", headers=abu.h)).json() == []
    # and withdrawing it hides the badges again at once
    await client.put("/api/mentors/mine/share", json={"share": True}, headers=joseph.h)
    await client.put("/api/mentors/mine/share", json={"share": False}, headers=joseph.h)
    assert (await client.get("/api/mentor/mentee-badges", headers=abu.h)).json() == []


async def test_mot03_r6_group_members_never_see_badges(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    joseph = await person(client, "joseph-1", gender="m")
    brother = await person(client, "brother-1", gender="m")
    await group_with(client, abu, joseph, brother)
    await earn(client, joseph, UNIT_BADGE)
    assert (await client.get("/api/mentor/mentee-badges", headers=brother.h)).json() == []
    assert (await client.get("/api/mentor/mentee-badges", headers=abu.h)).json() == []  # a group mentor is not his chosen mentor
