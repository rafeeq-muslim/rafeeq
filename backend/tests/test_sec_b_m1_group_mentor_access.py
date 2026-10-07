"""Security review B-M1: a mentor who is suspended, whose approval was
withdrawn or who lost the mentor role no longer reaches his groups
(CMP-05, ORG-02 R5). The members keep their group; what happens to it in the
long run is an open question for the Companion owner."""

from sqlalchemy import update

from app.core import ratelimit
from app.core.db import SessionLocal
from app.platform.models import User
from tests.cmp_helpers import Person, bodies, group_with, person, say
from tests.conftest import auth, register, with_roles
from tests.org_helpers import make_org


async def brothers(client):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    g = await group_with(client, mentor, joseph)
    mid = await say(client, joseph, g["id"], "Assalamu alaikum brothers")
    return mentor, joseph, g, mid


async def everything(client, who, g, member, message_id) -> dict[str, int]:
    """Every way a group's mentor reaches it."""
    gid = g["id"]
    return {
        "detail": (await client.get(f"/api/groups/{gid}", headers=who.h)).status_code,
        "read": (await client.get(f"/api/groups/{gid}/messages", headers=who.h)).status_code,
        "write": (await client.post(f"/api/groups/{gid}/messages", json={"body": "Still here"}, headers=who.h)).status_code,
        "hide": (await client.post(f"/api/groups/{gid}/messages/{message_id}/hide", headers=who.h)).status_code,
        "capacity": (await client.put(f"/api/groups/{gid}/capacity", json={"capacity": 12}, headers=who.h)).status_code,
        "remove": (await client.delete(f"/api/groups/{gid}/members/{member.id}", headers=who.h)).status_code,
        "challenge": (await client.get(f"/api/groups/{gid}/challenge", headers=who.h)).status_code,
        "set_challenge": (
            await client.post(f"/api/groups/{gid}/challenge", json={"type": "lessons_each", "target_count": 2}, headers=who.h)
        ).status_code,
    }


async def led(client, who) -> list[dict]:
    return [g for g in (await client.get("/api/groups/mine", headers=who.h)).json() if g["role"] == "mentor"]


async def test_m1_suspended_org_mentor_loses_his_groups_and_gets_them_back_when_reinstated(client):
    org = await make_org(client, languages=("en",))
    inv = await client.post(f"/api/org/{org.id}/invites", json={"gender": "m"}, headers=org.coordinator.h)
    ratelimit.reset()
    mentor = Person(await register(client, username="abu-abdullah", invite_code=inv.json()["code"], languages=["en"], locale="en"))
    assert (await client.post("/api/inbox/rules", headers=mentor.h)).status_code == 200
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    g = await group_with(client, mentor, joseph)
    mid = await say(client, joseph, g["id"], "Assalamu alaikum brothers")
    assert (await led(client, mentor))[0]["join_code"] == g["join_code"]

    assert (await client.post(f"/api/org/{org.id}/mentors/{mentor.id}/suspend", headers=org.coordinator.h)).status_code == 204

    got = await everything(client, mentor, g, joseph, mid)
    assert set(got.values()) == {403}, got
    assert await led(client, mentor) == []  # not even the join code
    # The members keep their group and its messages.
    assert await bodies(client, joseph, g["id"]) == ["Assalamu alaikum brothers"]
    assert (await client.get(f"/api/groups/{g['id']}", headers=joseph.h)).status_code == 200

    assert (await client.post(f"/api/org/{org.id}/mentors/{mentor.id}/reinstate", headers=org.coordinator.h)).status_code == 204
    assert (await client.get(f"/api/groups/{g['id']}/messages", headers=mentor.h)).status_code == 200
    assert len(await led(client, mentor)) == 1


async def test_m1_mentor_whose_approval_was_withdrawn_loses_his_groups(client):
    org = await make_org(client, languages=("en",))
    inv = await client.post(f"/api/org/{org.id}/invites", json={"gender": "m"}, headers=org.coordinator.h)
    ratelimit.reset()
    mentor = Person(await register(client, username="abu-abdullah", invite_code=inv.json()["code"], languages=["en"], locale="en"))
    await client.post("/api/inbox/rules", headers=mentor.h)
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    g = await group_with(client, mentor, joseph)
    mid = await say(client, joseph, g["id"], "Assalamu alaikum brothers")

    assert (await client.delete(f"/api/org/{org.id}/mentors/{mentor.id}", headers=org.coordinator.h)).status_code == 204

    got = await everything(client, mentor, g, joseph, mid)
    assert set(got.values()) == {403}, got


async def test_m1_account_that_lost_the_mentor_role_loses_his_groups(client):
    mentor, joseph, g, mid = await brothers(client)
    admin = auth(await with_roles(client, "admin-m1", "admin"))

    r = await client.put(f"/api/admin/users/{mentor.id}/roles", json={"roles": ["learner"]}, headers=admin)
    assert r.status_code == 200, r.text

    got = await everything(client, mentor, g, joseph, mid)
    assert set(got.values()) == {403}, got
    assert await led(client, mentor) == []
    assert await bodies(client, joseph, g["id"]) == ["Assalamu alaikum brothers"]


async def test_m1_an_active_mentor_keeps_his_groups(client):
    mentor, joseph, g, mid = await brothers(client)
    got = await everything(client, mentor, g, joseph, mid)
    assert got == {
        "detail": 200,
        "read": 200,
        "write": 201,
        "hide": 204,
        "capacity": 200,
        "remove": 204,
        "challenge": 200,
        "set_challenge": 201,
    }, got


async def test_m1_a_suspended_mentor_cannot_report_into_his_old_group(client):
    mentor, joseph, g, mid = await brothers(client)
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.id == mentor.id).values(roles=["learner"]))
        await s.commit()
    r = await client.post("/api/reports", json={"target_type": "group_message", "target_id": mid, "reason": "money"}, headers=mentor.h)
    assert r.status_code == 403, r.text
    assert await bodies(client, joseph, g["id"]) == ["Assalamu alaikum brothers"]  # nothing was hidden
