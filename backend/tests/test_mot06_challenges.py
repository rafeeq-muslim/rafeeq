"""MOT-06 weekly group challenge (and CMP-05 R6): one test per example."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.core.db import SessionLocal
from app.learning.models import UnitUnlock
from app.motivation.models import Challenge, ChallengeTemplate, LearningLog
from tests.cmp_helpers import group_with, person, record_pushes


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def brothers(client, n: int):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    members = [await person(client, f"brother-{i}", gender="m", languages=("en",)) for i in range(n)]
    g = await group_with(client, mentor, *members)
    return mentor, members, g


async def set_challenge(client, mentor, g, **body):
    r = await client.post(f"/api/groups/{g['id']}/challenge", json=body, headers=mentor.h)
    assert r.status_code == 201, r.text
    return r.json()


async def learn(client, who, *entries):
    r = await client.post("/api/me/learning-log", json={"entries": list(entries)}, headers=who.h)
    assert r.status_code == 200, r.text
    return r.json()


def lesson(lesson_id: str, day: str | None = None, repeat=False) -> dict:
    return {"kind": "lesson", "item_id": lesson_id, "is_repeat": repeat, **({"day": day} if day else {})}


async def view(client, who, g) -> dict | None:
    r = await client.get(f"/api/groups/{g['id']}/challenge", headers=who.h)
    assert r.status_code == 200, r.text
    return r.json()


# R1 -----------------------------------------------------------------------


async def test_mot06_r1_mentor_sets_challenge_for_seven_days(client, pushes):
    mentor, (joseph,), g = await brothers(client, 1)
    await set_challenge(client, mentor, g, type="lessons_each", target_count=3)
    seen = await view(client, joseph, g)
    starts, ends = datetime.fromisoformat(seen["starts_at"]), datetime.fromisoformat(seen["ends_at"])
    assert seen["type"] == "lessons_each" and seen["target_count"] == 3 and ends - starts == timedelta(days=7)
    assert [p["title"] for uid, p in pushes if uid == str(joseph.id)] == ["Your group has a new goal this week"]


async def test_mot06_r1_second_challenge_while_running_is_refused(client):
    mentor, _, g = await brothers(client, 1)
    await set_challenge(client, mentor, g, type="lessons_each", target_count=3)
    r = await client.post(f"/api/groups/{g['id']}/challenge", json={"type": "days_each", "target_count": 4}, headers=mentor.h)
    assert r.status_code == 409 and r.json()["detail"] == "challenge_running"


# R2 -----------------------------------------------------------------------


async def test_mot06_r2_lessons_each_counts_any_lessons_from_where_each_is(client):
    mentor, (joseph, colleague), g = await brothers(client, 2)
    await set_challenge(client, mentor, g, type="lessons_each", target_count=3)
    await learn(client, joseph, lesson("u1-l3"), lesson("u1-l4"), lesson("u1-l5"))
    await learn(client, colleague, lesson("u2-l6"), lesson("u2-l7"), lesson("u3-l1"))
    seen = await view(client, joseph, g)
    assert (seen["done"], seen["of"], seen["mine"]) == (2, 2, True)


async def test_mot06_r2_days_count_distinct_learning_days(client):
    mentor, (joseph,), g = await brothers(client, 1)
    await set_challenge(client, mentor, g, type="days_each", target_count=3)
    today = datetime.now(UTC).date()
    d1, d2 = today.isoformat(), (today - timedelta(days=1)).isoformat()
    await learn(client, joseph, lesson("u1-l1", d1), lesson("u1-l2", d1), lesson("u1-l3", d2))
    async with SessionLocal() as s:
        days = {r.day for r in await s.scalars(select(LearningLog))}
    assert len(days) == 2
    assert (await view(client, joseph, g))["mine"] is False  # two learning days, not three
    await learn(client, joseph, {"kind": "day", "item_id": (today + timedelta(days=1)).isoformat()})  # a review day counts too
    assert (await view(client, joseph, g))["mine"] is True


async def test_mot06_r2_lesson_challenge_unlocks_nothing(client):
    mentor, (newcomer,), g = await brothers(client, 1)
    seen = await set_challenge(client, mentor, g, type="lesson", target_id="u2-l1")
    assert seen["target_id"] == "u2-l1"
    learning = (await client.get("/api/me/learning", headers=newcomer.h)).json()
    assert learning["unlockedUnits"] == [] and learning["completed"] == {}
    async with SessionLocal() as s:
        assert list(await s.scalars(select(UnitUnlock))) == []


# R3 -----------------------------------------------------------------------


async def test_mot06_r3_approved_free_text_starts_and_becomes_template(client):
    mentor, (joseph,), g = await brothers(client, 1)
    reviewer = await person(client, "muhannad-r", roles=("sharia_reviewer",))
    pending = await set_challenge(client, mentor, g, type="free_text", text="Get to know a mosque near where you live")
    assert pending["status"] == "pending_review"
    assert await view(client, joseph, g) is None  # not shown before approval
    r = await client.post(f"/api/challenges/{pending['id']}/review", json={"approve": True}, headers=reviewer.h)
    assert r.status_code == 200, r.text
    seen = await view(client, joseph, g)
    assert seen["status"] == "active" and seen["text"] == "Get to know a mosque near where you live" and seen["ends_at"]
    async with SessionLocal() as s:
        assert [t.text for t in await s.scalars(select(ChallengeTemplate))] == ["Get to know a mosque near where you live"]


async def test_mot06_r3_rejected_free_text_is_never_shown(client, pushes):
    mentor, (joseph,), g = await brothers(client, 1)
    reviewer = await person(client, "muhannad-r", roles=("sharia_reviewer",))
    pending = await set_challenge(client, mentor, g, type="free_text", text="Pray fajr in the mosque every day")
    await client.post(f"/api/challenges/{pending['id']}/review", json={"approve": False}, headers=reviewer.h)
    assert await view(client, joseph, g) is None
    assert (await view(client, mentor, g))["status"] == "rejected"
    assert [p["title"] for uid, p in pushes if uid == str(mentor.id)] == ["There's an update in your group"]
    assert (await client.get("/api/challenges/templates", headers=mentor.h)).json() == []


async def test_mot06_r3_template_is_shown_immediately(client):
    async with SessionLocal() as s:
        tpl = ChallengeTemplate(text="Get to know a mosque near where you live", lang="en")
        s.add(tpl)
        await s.commit()
    mentor, (joseph,), g = await brothers(client, 1)
    await set_challenge(client, mentor, g, type="free_text", template_id=str(tpl.id))
    seen = await view(client, joseph, g)
    assert seen["status"] == "active" and seen["text"] == tpl.text
    assert (await client.post(f"/api/challenges/{seen['id']}/check", headers=joseph.h)).status_code == 204
    assert (await view(client, joseph, g))["done"] == 1


# R4 -----------------------------------------------------------------------


async def test_mot06_r4_progress_is_a_count_without_names(client):
    mentor, members, g = await brothers(client, 8)
    await set_challenge(client, mentor, g, type="lessons_each", target_count=1)
    for m in members[:6]:
        await learn(client, m, lesson("u1-l1"))
    seen = await view(client, members[7], g)
    assert (seen["done"], seen["of"], seen["counts"]) == (6, 8, "members")
    blob = str(seen)
    assert all(str(m.id) not in blob and m.display_name not in blob for m in members)
    assert seen["shared_done"] is None


async def test_mot06_r4_leaver_and_their_lessons_drop_out_of_total(client):
    mentor, (a, b, leaver), g = await brothers(client, 3)
    await set_challenge(client, mentor, g, type="group_total", target_count=20)
    await learn(client, a, *[lesson(f"u1-l{i}") for i in range(1, 7)])
    await learn(client, b, *[lesson(f"u2-l{i}") for i in range(1, 6)])
    await learn(client, leaver, *[lesson(f"u3-l{i}") for i in range(1, 4)])
    assert ((await view(client, a, g))["done"], (await view(client, a, g))["of"]) == (14, 20)
    await client.post(f"/api/groups/{g['id']}/leave", headers=leaver.h)
    seen = await view(client, a, g)
    assert (seen["done"], seen["of"], seen["counts"]) == (11, 20, "lessons")


async def test_mot06_r4_mentor_sees_only_members_who_share_with_him(client):
    mentor, (joseph, colleague), g = await brothers(client, 2)
    for who in (joseph, colleague):
        await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=who.h)
    await client.put("/api/mentors/mine/share", json={"share": True}, headers=joseph.h)
    await set_challenge(client, mentor, g, type="lessons_each", target_count=1)
    await learn(client, joseph, lesson("u1-l1"))
    await learn(client, colleague, lesson("u1-l1"))
    seen = await view(client, mentor, g)
    assert seen["done"] == 2 and seen["shared_done"] == [str(joseph.id)]
    # permission withdrawn: gone at once (asked live, never copied)
    await client.put("/api/mentors/mine/share", json={"share": False}, headers=joseph.h)
    assert (await view(client, mentor, g))["shared_done"] == []


# R5 -----------------------------------------------------------------------


async def test_mot06_r5_ended_challenge_shows_result_without_names(client):
    mentor, members, g = await brothers(client, 3)
    c = await set_challenge(client, mentor, g, type="lessons_each", target_count=1)
    await learn(client, members[0], lesson("u1-l1"))
    async with SessionLocal() as s:
        await s.execute(update(Challenge).where(Challenge.id == c["id"]).values(ends_at=datetime.now(UTC)))
        await s.commit()
    seen = await view(client, members[2], g)
    assert seen["ended"] is True and (seen["done"], seen["of"]) == (1, 3)
    assert seen["mine"] is False and all(m.display_name not in str(seen) for m in members)
    # and the mentor can start the next week's challenge
    await set_challenge(client, mentor, g, type="days_each", target_count=2)


# CMP-05 R6 and minimum data ------------------------------------------------


async def test_cmp05_r6_group_page_challenge_shows_count_only(client):
    mentor, members, g = await brothers(client, 8)
    await set_challenge(client, mentor, g, type="lesson", target_id="u1-l2")
    for m in members[:6]:
        await learn(client, m, lesson("u1-l2"))
    seen = await view(client, members[0], g)
    assert (seen["done"], seen["of"]) == (6, 8)


async def test_mot06_learning_log_is_kept_only_for_group_members(client):
    loner = await person(client, "daniel-1", gender="m")
    assert (await learn(client, loner, lesson("u1-l1")))["stored"] == 0
    async with SessionLocal() as s:
        assert list(await s.scalars(select(LearningLog))) == []
