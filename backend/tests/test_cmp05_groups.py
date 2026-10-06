"""CMP-05 small groups (rewrite, PR #21): one test per example (R6 is in test_mot06_challenges.py)."""

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from tests.cmp_helpers import bodies, group_with, person, say


async def events(name: str) -> list[dict]:
    async with SessionLocal() as s:
        return [e.payload for e in await s.scalars(select(OutboxEvent).where(OutboxEvent.name == name))]


async def abu(client):
    return await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en", "ar"))


# R1 -----------------------------------------------------------------------


async def test_cmp05_r1_mentor_creates_group_in_his_gender_and_language(client):
    mentor = await abu(client)
    g = await group_with(client, mentor)
    assert (g["gender"], g["lang"], g["capacity"], g["role"]) == ("m", "en", 10, "mentor")
    assert len(g["join_code"]) == 8
    assert await events("GroupCreated") == [{"group_id": g["id"], "mentor_id": str(mentor.id)}]
    # a language he does not speak is refused
    r = await client.post("/api/groups", json={"name": "Kapatid", "lang": "tl"}, headers=mentor.h)
    assert r.status_code == 422


async def test_cmp05_r1_learner_cannot_create_group(client):
    joseph = await person(client, "joseph-1", gender="m")
    r = await client.post("/api/groups", json={"name": "My group", "lang": "en"}, headers=joseph.h)
    assert r.status_code == 403


async def test_cmp05_r1_capacity_defaults_to_ten_and_is_at_most_fifteen(client):
    mentor = await abu(client)
    r = await client.post("/api/groups", json={"name": "Big group", "lang": "en", "capacity": 16}, headers=mentor.h)
    assert r.status_code == 422
    r = await client.post("/api/groups", json={"name": "Default group", "lang": "en"}, headers=mentor.h)
    assert r.json()["capacity"] == 10


async def test_cmp05_r1_mentor_holds_at_most_25_group_members(client):
    mentor = await abu(client)
    first = (await client.post("/api/groups", json={"name": "Fifteen", "lang": "en", "capacity": 15}, headers=mentor.h)).json()
    await client.post("/api/groups", json={"name": "Ten", "lang": "en", "capacity": 10}, headers=mentor.h)
    r = await client.post("/api/groups", json={"name": "Third", "lang": "en", "capacity": 2}, headers=mentor.h)
    assert r.status_code == 409 and r.json()["detail"] == {"code": "mentor_member_limit", "limit": 25, "remaining": 0}
    r = await client.put(f"/api/groups/{first['id']}/capacity", json={"capacity": 15}, headers=mentor.h)
    assert r.status_code == 200  # unchanged is fine
    second = [g for g in (await client.get("/api/groups/mine", headers=mentor.h)).json() if g["name"] == "Ten"][0]
    r = await client.put(f"/api/groups/{second['id']}/capacity", json={"capacity": 11}, headers=mentor.h)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "mentor_member_limit"


async def test_cmp05_r1_mentor_lowers_and_raises_capacity_within_limits(client):
    mentor = await abu(client)
    a = await person(client, "member-a", gender="m")
    b = await person(client, "member-b", gender="m")
    g = await group_with(client, mentor, a, b, capacity=10)
    assert (await client.put(f"/api/groups/{g['id']}/capacity", json={"capacity": 12}, headers=mentor.h)).json()["capacity"] == 12
    r = await client.put(f"/api/groups/{g['id']}/capacity", json={"capacity": 2}, headers=mentor.h)
    assert r.status_code == 200
    r = await client.put(f"/api/groups/{g['id']}/capacity", json={"capacity": 3}, headers=a.h)
    assert r.status_code == 403  # members do not change it


# R2 -----------------------------------------------------------------------


async def test_cmp05_r2_join_by_code_emits_group_joined(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m", languages=("tl", "en"))
    g = await group_with(client, mentor, joseph)
    assert await events("GroupJoined") == [{"group_id": g["id"], "user_id": str(joseph.id)}]
    mine = (await client.get("/api/groups/mine", headers=joseph.h)).json()
    assert [(x["id"], x["role"], x["join_code"]) for x in mine] == [(g["id"], "member", None)]


async def test_cmp05_r2_other_gender_gets_not_suitable_without_details(client):
    mentor = await abu(client)
    g = await group_with(client, mentor)
    maria = await person(client, "maria-1", gender="f", languages=("en",))
    r = await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=maria.h)
    assert r.status_code == 403 and r.json() == {"detail": "group_not_suitable"}


async def test_cmp05_r2_full_group_rejects(client):
    mentor = await abu(client)
    a = await person(client, "member-a", gender="m")
    b = await person(client, "member-b", gender="m")
    g = await group_with(client, mentor, a, b, capacity=2)
    joseph = await person(client, "joseph-1", gender="m")
    r = await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=joseph.h)
    assert r.status_code == 409 and r.json()["detail"] == "group_full"


async def test_cmp05_r2_one_group_at_a_time(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    await group_with(client, mentor, joseph)
    r = await client.post("/api/groups", json={"name": "Second group", "lang": "en"}, headers=mentor.h)
    r = await client.post("/api/groups/join", json={"code": r.json()["join_code"]}, headers=joseph.h)
    assert r.status_code == 409 and r.json()["detail"] == "already_in_group"


# R3 -----------------------------------------------------------------------


async def test_cmp05_r3_members_show_display_names_only(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    daniel = await person(client, "daniel-1", gender="m", display_name="نخلة الهادئ")
    g = await group_with(client, mentor, joseph, daniel)
    detail = (await client.get(f"/api/groups/{g['id']}", headers=joseph.h)).json()
    assert [m["display_name"] for m in detail["members"]] == ["Joseph-1", "نخلة الهادئ"]
    assert set(detail["members"][0]) == {"id", "display_name", "is_me"}
    assert "daniel-1" not in str(detail) and detail["join_code"] is None


# R4 -----------------------------------------------------------------------


async def test_cmp05_r4_member_message_is_seen_with_display_name(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    daniel = await person(client, "daniel-1", gender="m")
    g = await group_with(client, mentor, joseph, daniel)
    await say(client, joseph, g["id"], "I finished the wudu lesson today")
    for who in (daniel, mentor):
        msgs = (await client.get(f"/api/groups/{g['id']}/messages", headers=who.h)).json()
        assert [(m["author_name"], m["body"]) for m in msgs] == [("Joseph-1", "I finished the wudu lesson today")]


async def test_cmp05_r4_non_member_cannot_read_messages(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    g = await group_with(client, mentor, joseph)
    daniel = await person(client, "daniel-1", gender="m")
    assert (await client.get(f"/api/groups/{g['id']}/messages", headers=daniel.h)).status_code == 404
    assert (await client.post(f"/api/groups/{g['id']}/messages", json={"body": "hi"}, headers=daniel.h)).status_code == 404


async def test_cmp05_r4_messenger_link_is_rejected(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    g = await group_with(client, mentor, joseph)
    r = await client.post(f"/api/groups/{g['id']}/messages", json={"body": "join https://t.me/+abcdef"}, headers=joseph.h)
    assert r.status_code == 422 and r.json()["detail"] == {"code": "contact_not_allowed", "kind": "link"}
    assert await bodies(client, mentor, g["id"]) == []


# R5 -----------------------------------------------------------------------


async def test_cmp05_r5_leaving_is_silent_and_emits_group_left(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    daniel = await person(client, "daniel-1", gender="m")
    g = await group_with(client, mentor, joseph, daniel)
    await say(client, daniel, g["id"], "salam")
    assert (await client.post(f"/api/groups/{g['id']}/leave", headers=joseph.h)).status_code == 204
    assert (await client.get(f"/api/groups/{g['id']}/messages", headers=joseph.h)).status_code == 404
    assert await bodies(client, daniel, g["id"]) == ["salam"]  # no "Joseph left" line
    assert await events("GroupLeft") == [{"group_id": g["id"], "user_id": str(joseph.id)}]


async def test_cmp05_r5_mentor_removes_member(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    g = await group_with(client, mentor, joseph)
    assert (await client.delete(f"/api/groups/{g['id']}/members/{joseph.id}", headers=mentor.h)).status_code == 204
    assert (await client.get("/api/groups/mine", headers=joseph.h)).json() == []
    assert await events("GroupLeft") == [{"group_id": g["id"], "user_id": str(joseph.id)}]


async def join(client, who, g) -> int:
    return (await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=who.h)).status_code


async def removals(user_id) -> int:
    from sqlalchemy import func

    from app.companion.models import GroupRemoval

    async with SessionLocal() as s:
        return await s.scalar(select(func.count()).select_from(GroupRemoval).where(GroupRemoval.user_id == user_id)) or 0


async def test_cmp05_r5_removed_member_cannot_rejoin_with_the_same_code(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    g = await group_with(client, mentor, joseph)
    await client.delete(f"/api/groups/{g['id']}/members/{joseph.id}", headers=mentor.h)
    r = await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=joseph.h)
    assert r.status_code == 403 and r.json()["detail"] == "group_unavailable"  # neutral: no "you were removed"
    assert (await client.get("/api/groups/mine", headers=joseph.h)).json() == []
    assert await events("GroupJoined") == [{"group_id": g["id"], "user_id": str(joseph.id)}]  # only the first join


async def test_cmp05_r5_member_who_left_can_rejoin(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    g = await group_with(client, mentor, joseph)
    await client.post(f"/api/groups/{g['id']}/leave", headers=joseph.h)
    assert await join(client, joseph, g) == 200
    assert await removals(joseph.id) == 0


async def test_cmp05_r5_removal_does_not_affect_other_groups_or_members(client):
    mentor = await abu(client)
    other_mentor = await person(client, "abu-yusuf", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph-1", gender="m")
    daniel = await person(client, "daniel-1", gender="m")
    g = await group_with(client, mentor, joseph)
    await client.delete(f"/api/groups/{g['id']}/members/{joseph.id}", headers=mentor.h)
    assert await join(client, daniel, g) == 200  # the code still works for everyone else
    second = await group_with(client, mentor)
    third = await group_with(client, other_mentor)
    assert await join(client, joseph, second) == 200  # another group of the same mentor
    await client.post(f"/api/groups/{second['id']}/leave", headers=joseph.h)
    assert await join(client, joseph, third) == 200


async def test_cmp05_r5_account_deletion_clears_the_removal(client):
    mentor = await abu(client)
    joseph = await person(client, "joseph-1", gender="m")
    g = await group_with(client, mentor, joseph)
    await client.delete(f"/api/groups/{g['id']}/members/{joseph.id}", headers=mentor.h)
    assert await removals(joseph.id) == 1
    assert (await client.delete("/api/me", headers=joseph.h)).status_code == 204
    assert await removals(joseph.id) == 0  # PLT-05 R5: nothing about the person stays
