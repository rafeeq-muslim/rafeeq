"""Security review 2026-10-07, follow-up: when an admin takes the mentor role
away, the account stops being anyone's mentor, as for a suspension (ORG-02 R5,
CMP-03 R4): each mentee's link ends with the neutral notice, his open requests
return to the pool under the same-gender rule (CMP-01 R3), and giving the role
back restores nothing. His groups stay as they were (access blocked)."""

import pytest
from sqlalchemy import select

from app.companion import notify
from app.companion.models import MentorProfile
from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from tests.cmp_helpers import group_with, person, record_pushes, settle
from tests.conftest import auth, with_roles
from tests.test_cmp03_r4_ended_link import ask_own_mentor, choose, held_by, learner_still_reads, old_thread, sees_nothing_of, write


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def set_roles(client, admin: dict, who, *roles: str) -> None:
    r = await client.put(f"/api/admin/users/{who.id}/roles", json={"roles": list(roles)}, headers=admin)
    assert r.status_code == 200, r.text


async def inbox_ids(client, who) -> list[str]:
    r = await client.get("/api/inbox/requests", headers=who.h)
    assert r.status_code == 200, r.text
    return [x["id"] for x in r.json()]


async def removals() -> list[dict]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(OutboxEvent.payload).where(OutboxEvent.name == "MentorRoleRemoved")))


async def test_removing_the_mentor_role_ends_links_and_returns_requests_to_the_pool(client, pushes):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    brother = await person(client, "other-brother", roles=("mentor",), gender="m", languages=("en",))
    sister = await person(client, "a-sister", roles=("mentor",), gender="f", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    asker = await person(client, "asker-1", gender="m", languages=("en",), display_name="Asker")
    await choose(client, daniel, abu)
    tid = await old_thread(client, daniel, abu)
    own = await ask_own_mentor(client, daniel, "How do I pray?")
    r = await client.post("/api/help/requests", json={"kind": "human", "gender": "m", "lang": "en", "body": "A question"}, headers=asker.h)
    taken = r.json()["request"]["id"]
    assert (await client.post(f"/api/inbox/requests/{taken}/messages", json={"body": "Welcome"}, headers=abu.h)).status_code == 201
    assert await held_by(own) == abu.id and await held_by(taken) == abu.id
    await settle()
    pushes.clear()

    await set_roles(client, admin, abu, "learner")
    await settle()

    # The mentee: no mentor, the neutral notice, the old thread closed and still readable.
    mine = (await client.get("/api/mentors/mine", headers=daniel.h)).json()
    assert mine["mentor"] is None and mine["mentor_ended"] is True
    ((to, payload),) = pushes
    assert to == str(daniel.id)
    assert payload["title"] == notify.TEXTS["mentor_change"]["en"] and payload["body"] == ""
    seen = str(payload) + (await client.get("/api/mentors/mine", headers=daniel.h)).text
    for leak in (abu.display_name, "role", "admin", "remov", "reason"):
        assert leak not in seen
    await learner_still_reads(client, daniel, tid)

    # The requests he held: back in the pool, same gender only (CMP-01 R3).
    assert await held_by(own) is None and await held_by(taken) is None
    assert {own, taken} <= set(await inbox_ids(client, brother))
    assert await inbox_ids(client, sister) == []

    # The former mentor sees nothing, now or after the learner writes again.
    assert (await client.get("/api/inbox/requests", headers=abu.h)).status_code == 403
    went = await write(client, daniel, tid, "Are you there?")
    assert went["id"] != tid and went["kind"] == "human"
    assert went["id"] in await inbox_ids(client, brother)
    assert await removals() == [{"mentor_id": str(abu.id)}]

    # Choosing another mentor closes the notice.
    await choose(client, daniel, brother)
    assert (await client.get("/api/mentors/mine", headers=daniel.h)).json()["mentor_ended"] is False


async def test_giving_the_role_back_restores_no_link(client, pushes):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    brother = await person(client, "other-brother", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    await choose(client, daniel, abu)
    tid = await old_thread(client, daniel, abu)
    own = await ask_own_mentor(client, daniel, "How do I pray?")

    await set_roles(client, admin, abu, "learner")
    await set_roles(client, admin, abu, "learner", "mentor")
    await settle()

    assert (await client.get("/api/mentors/mine", headers=daniel.h)).json()["mentor"] is None
    went = await write(client, daniel, tid, "Are you there?")
    assert await inbox_ids(client, abu) == []  # his inbox is back (not suspended), without the learner
    await sees_nothing_of(client, abu, daniel, tid, own, went["id"], words="Are you there?")
    assert {own, went["id"]} <= set(await inbox_ids(client, brother))
    await learner_still_reads(client, daniel, tid)
    async with SessionLocal() as s:
        assert not (await s.get(MentorProfile, abu.id)).suspended  # an organisation's suspension is a separate thing


async def test_other_roles_of_the_account_are_kept(client, pushes):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    abu = await person(client, "abu-abdullah", roles=("mentor", "sharia_reviewer"), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await choose(client, daniel, abu)

    await set_roles(client, admin, abu, "sharia_reviewer")

    found = (await client.get("/api/admin/users?username=abu-abdullah", headers=admin)).json()[0]
    assert found["roles"] == ["sharia_reviewer"]
    assert (await client.get("/api/mentors/mine", headers=daniel.h)).json()["mentor"] is None


async def test_removing_a_different_role_leaves_links_alone(client, pushes):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    abu = await person(client, "abu-abdullah", roles=("mentor", "sharia_reviewer"), gender="m", languages=("en",))
    plain = await person(client, "plain-1", roles=("sharia_reviewer",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await choose(client, daniel, abu)
    own = await ask_own_mentor(client, daniel, "How do I pray?")
    await settle()
    pushes.clear()

    await set_roles(client, admin, abu, "mentor")  # the reviewer role goes, the mentor role stays
    await set_roles(client, admin, abu, "mentor", "sharia_reviewer")  # and a role is added
    await set_roles(client, admin, plain, "learner")  # an account that never was a mentor
    await settle()

    mine = (await client.get("/api/mentors/mine", headers=daniel.h)).json()
    assert mine["mentor"]["id"] == str(abu.id) and mine["mentor_ended"] is False
    assert await held_by(own) == abu.id and own in await inbox_ids(client, abu)
    assert pushes == [] and await removals() == []


async def test_his_group_is_left_as_it_was(client, pushes):
    """Open owner question: what happens to a former mentor's groups. Nothing
    is decided here: the group and its members stay, his access is blocked."""
    admin = auth(await with_roles(client, "admin-1", "admin"))
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    g = await group_with(client, abu, joseph)

    await set_roles(client, admin, abu, "learner")

    assert (await client.get(f"/api/groups/{g['id']}", headers=abu.h)).status_code == 403
    assert (await client.get(f"/api/groups/{g['id']}", headers=joseph.h)).status_code == 200
    assert [x["id"] for x in (await client.get("/api/groups/mine", headers=joseph.h)).json()] == [g["id"]]
