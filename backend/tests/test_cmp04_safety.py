"""CMP-04 report and block (rewrite, PR #21): one test per example."""

import pytest
from sqlalchemy import select

from app.companion.models import Report
from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from tests.cmp_helpers import bodies, group_with, person, record_pushes, say, settle


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def setup_group(client):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="f", languages=("en",))
    layla = await person(client, "layla-1", gender="f", languages=("en",))
    other = await person(client, "stranger-1", gender="f", languages=("en",))
    third = await person(client, "amina-1", gender="f", languages=("en",))
    g = await group_with(client, mentor, layla, other, third)
    return mentor, layla, other, third, g


async def report(client, who, target_id, reason, target_type="group_message", headers=None):
    r = await client.post(
        "/api/reports", json={"target_type": target_type, "target_id": target_id, "reason": reason}, headers=headers or who.h
    )
    assert r.status_code == 201, r.text
    return r.json()


async def queue(client, team):
    r = await client.get("/api/team/reports", headers=team.h)
    assert r.status_code == 200, r.text
    return r.json()


# R1 -----------------------------------------------------------------------


async def test_cmp04_r1_report_reaches_team_queue(client):
    _, layla, other, _, g = await setup_group(client)
    team = await person(client, "team-one", roles=("team",))
    mid = await say(client, other, g["id"], "Can you send me some money?")
    await report(client, layla, mid, "money")
    items = await queue(client, team)
    assert [(i["target_id"], i["reason"], i["priority"], i["place"]) for i in items] == [(mid, "money", "high", "Riyadh Brothers")]


async def test_cmp04_r1_guest_can_report_mentor_message(client):
    out = (await client.post("/api/help/requests", json={"lang": "en", "body": "hello", "gender": "m"})).json()
    token = {"X-Help-Token": out["guest_token"]}
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await client.post(f"/api/inbox/requests/{out['request']['id']}/messages", json={"body": "Give me your address"}, headers=mentor.h)
    thread = (await client.get(f"/api/help/requests/{out['request']['id']}", headers=token)).json()
    mid = [m for m in thread["messages"] if m["author"] == "mentor"][0]["id"]
    await report(client, None, mid, "other", target_type="help_message", headers=token)
    team = await person(client, "team-one", roles=("team",))
    assert [i["target_id"] for i in await queue(client, team)] == [mid]


# R2 -----------------------------------------------------------------------


async def test_cmp04_r2_marriage_report_hides_message_for_everyone(client):
    mentor, layla, other, third, g = await setup_group(client)
    mid = await say(client, other, g["id"], "Would you marry me?")
    out = await report(client, layla, mid, "marriage")
    assert out["hidden_for_all"] is True
    for who in (layla, third, mentor):
        assert "Would you marry me?" not in await bodies(client, who, g["id"])


async def test_cmp04_r2_other_reason_hides_only_for_reporter(client):
    _, layla, other, third, g = await setup_group(client)
    mid = await say(client, other, g["id"], "You are stupid")
    await report(client, layla, mid, "abuse")
    assert "You are stupid" not in await bodies(client, layla, g["id"])
    assert "You are stupid" in await bodies(client, third, g["id"])


# R3 -----------------------------------------------------------------------


async def test_cmp04_r3_danger_to_someone_tops_the_queue_and_alerts_the_team(client, pushes):
    _, layla, other, third, g = await setup_group(client)
    team = await person(client, "team-one", roles=("team",))
    money = await say(client, other, g["id"], "Send me money")
    await report(client, layla, money, "money")  # older, dangerous
    hurt = await say(client, third, g["id"], "I keep thinking about hurting myself")
    out = await report(client, layla, hurt, "danger")
    assert out["hidden_for_all"] is False  # not one of the three dangerous reasons: the group still sees it
    items = await queue(client, team)
    assert [(i["target_id"], i["reason"], i["priority"]) for i in items] == [(hurt, "danger", "danger"), (money, "money", "high")]
    await settle()
    titles = [p["title"] for uid, p in pushes if uid == str(team.id)]
    assert "An urgent report is waiting" in titles
    assert all("hurt" not in str(p) for _, p in pushes)  # neutral: no message text


async def test_cmp04_r3_dangerous_reason_also_alerts_the_team(client, pushes):
    _, layla, other, _, g = await setup_group(client)
    team = await person(client, "team-one", roles=("team",))
    await report(client, layla, await say(client, other, g["id"], "Marry me"), "marriage")
    abuse = await say(client, other, g["id"], "You are slow")
    await report(client, layla, abuse, "abuse")
    await settle()
    assert [p["title"] for uid, p in pushes if uid == str(team.id)] == ["A report is waiting for review"]


# R4 -----------------------------------------------------------------------


async def test_cmp04_r4_team_restores_message(client):
    _, layla, other, third, g = await setup_group(client)
    team = await person(client, "team-one", roles=("team",))
    mid = await say(client, other, g["id"], "Marriage is half of the religion, they say")
    await report(client, layla, mid, "marriage")
    rid = (await queue(client, team))[0]["id"]
    r = await client.post(f"/api/team/reports/{rid}", json={"action": "restore"}, headers=team.h)
    assert r.json()["status"] == "dismissed"
    assert "Marriage is half of the religion, they say" in await bodies(client, third, g["id"])


async def test_cmp04_r4_team_removes_member_and_emits_group_left(client):
    mentor, layla, other, _, g = await setup_group(client)
    team = await person(client, "team-one", roles=("team",))
    mid = await say(client, other, g["id"], "Join our special group, the only true path")
    await report(client, layla, mid, "recruitment")
    rid = (await queue(client, team))[0]["id"]
    await client.post(f"/api/team/reports/{rid}", json={"action": "remove_member"}, headers=team.h)
    assert (await client.get(f"/api/groups/{g['id']}", headers=other.h)).status_code == 404
    members = (await client.get(f"/api/groups/{g['id']}", headers=mentor.h)).json()["members"]
    assert str(other.id) not in [m["id"] for m in members]
    async with SessionLocal() as s:
        left = [e.payload for e in await s.scalars(select(OutboxEvent).where(OutboxEvent.name == "GroupLeft"))]
    assert left == [{"group_id": g["id"], "user_id": str(other.id)}]
    r = await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=other.h)
    assert r.status_code == 403 and r.json()["detail"] == "group_unavailable"  # no rejoin with the same code


async def test_cmp04_r4_team_removal_holds_even_if_the_author_left_first(client):
    _, layla, other, _, g = await setup_group(client)
    team = await person(client, "team-one", roles=("team",))
    mid = await say(client, other, g["id"], "Join our special group, the only true path")
    await report(client, layla, mid, "recruitment")
    await client.post(f"/api/groups/{g['id']}/leave", headers=other.h)
    rid = (await queue(client, team))[0]["id"]
    assert (await client.post(f"/api/team/reports/{rid}", json={"action": "remove_member"}, headers=team.h)).status_code == 200
    r = await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=other.h)
    assert r.status_code == 403 and r.json()["detail"] == "group_unavailable"


async def test_cmp04_r4_group_mentor_hides_message_with_record(client):
    mentor, _, other, third, g = await setup_group(client)
    mid = await say(client, other, g["id"], "rude words")
    assert (await client.post(f"/api/groups/{g['id']}/messages/{mid}/hide", headers=mentor.h)).status_code == 204
    assert "rude words" not in await bodies(client, third, g["id"])
    async with SessionLocal() as s:
        rec = list(await s.scalars(select(Report)))
    assert [(r.reason, r.status) for r in rec] == [("mentor_hidden", "actioned")]
    # a member is not the mentor
    assert (await client.post(f"/api/groups/{g['id']}/messages/{mid}/hide", headers=third.h)).status_code == 403


async def test_cmp04_r4_learner_cannot_open_report_queue(client):
    joseph = await person(client, "joseph-1", gender="m")
    assert (await client.get("/api/team/reports", headers=joseph.h)).status_code == 403


# R5 -----------------------------------------------------------------------


async def test_cmp04_r5_author_sees_hidden_without_reporter(client):
    _, layla, other, _, g = await setup_group(client)
    mid = await say(client, other, g["id"], "Send me 100 riyals")
    await report(client, layla, mid, "money")
    msgs = (await client.get(f"/api/groups/{g['id']}/messages", headers=other.h)).json()
    mine = [m for m in msgs if m["id"] == mid][0]
    assert mine["hidden"] is True
    assert str(layla.id) not in str(msgs) and "Layla" not in str(msgs)


# R6 -----------------------------------------------------------------------


async def test_cmp04_r6_blocked_member_messages_are_hidden_for_blocker(client):
    _, layla, other, third, g = await setup_group(client)
    await say(client, other, g["id"], "hello sisters")
    assert (await client.post("/api/blocks", json={"user_id": str(other.id)}, headers=layla.h)).status_code == 204
    assert "hello sisters" not in await bodies(client, layla, g["id"])
    assert "hello sisters" in await bodies(client, third, g["id"])


async def test_cmp04_r6_blocking_mentor_ends_link(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await client.post("/api/mentors/choose", json={"mentor_id": str(abu.id)}, headers=daniel.h)
    assert (await client.post("/api/mentors/mine/block", headers=daniel.h)).status_code == 204
    assert (await client.get("/api/mentors/mine", headers=daniel.h)).json()["mentor"] is None
    assert (await client.get("/api/inbox/mentees", headers=abu.h)).json() == []
    # and he is never suggested again
    assert (await client.get("/api/mentors/suggestions", headers=daniel.h)).json() == []


async def test_cmp04_r6_blocking_responder_returns_request_to_other_sisters(client):
    layla = await person(client, "layla-1", gender="f", languages=("en",))
    m1 = await person(client, "mentor-one", roles=("mentor",), gender="f", languages=("en",))
    m2 = await person(client, "mentor-two", roles=("mentor",), gender="f", languages=("en",))
    brother = await person(client, "mentor-three", roles=("mentor",), gender="m", languages=("en",))
    rid = (await client.post("/api/help/requests", json={"lang": "en", "body": "hi"}, headers=layla.h)).json()["request"]["id"]
    await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "hi, I'm here"}, headers=m1.h)
    assert (await client.post(f"/api/help/requests/{rid}/block", headers=layla.h)).status_code == 204
    assert rid in [r["id"] for r in (await client.get("/api/inbox/requests", headers=m2.h)).json()]
    assert rid not in [r["id"] for r in (await client.get("/api/inbox/requests", headers=m1.h)).json()]
    assert (await client.get(f"/api/inbox/requests/{rid}", headers=m1.h)).status_code == 404
    assert rid not in [r["id"] for r in (await client.get("/api/inbox/requests", headers=brother.h)).json()]


async def test_cmp04_r6_cannot_block_self(client):
    daniel = await person(client, "daniel-1", gender="m")
    r = await client.post("/api/blocks", json={"user_id": str(daniel.id)}, headers=daniel.h)
    assert r.status_code == 400 and r.json()["detail"] == "cannot_block_self"
