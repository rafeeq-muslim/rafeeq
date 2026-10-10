"""CMP-05 R8/R9 and CMP-02 R8 (owner decisions 2026-10-10).

R8: the team (team role or admin) lists every group with its mentor and
state, groups needing a mentor first; assigns a mentor of the group's gender
who speaks its language, is in good standing and has places; pauses, resumes
and closes; same-gender staff read the chat and hide messages.
R9: a suspended, de-approved or de-roled mentor's groups need a mentor: the
team and the members are told (neutral), members read and do not post.
CMP-02 R8: an escalated private mentor thread stays one thread and the team
reads all of it; nobody else does; each staff opening is recorded (ids only).
"""

import pytest
from sqlalchemy import select

from app.companion import notify
from app.companion.models import Report
from app.core import ratelimit
from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from tests.cmp_helpers import Person, bodies, group_with, person, record_pushes, say, settle
from tests.conftest import auth, register, with_roles
from tests.org_helpers import make_org

NOTICES = set(notify.TEXTS["notice"].values())


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def staff_list(client, who) -> list[dict]:
    r = await client.get("/api/staff/groups", headers=who.h)
    assert r.status_code == 200, r.text
    return r.json()


async def events(name: str) -> list[dict]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(OutboxEvent.payload).where(OutboxEvent.name == name)))


async def org_mentor(client, org, username="abu-abdullah") -> Person:
    inv = await client.post(f"/api/org/{org.id}/invites", json={"gender": "m"}, headers=org.coordinator.h)
    assert inv.status_code in (200, 201), inv.text
    ratelimit.reset()
    m = Person(await register(client, username=username, invite_code=inv.json()["code"], languages=["en"], locale="en"))
    assert (await client.post("/api/inbox/rules", headers=m.h)).status_code == 200
    return m


async def cast(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    daniel = await person(client, "daniel", gender="m", languages=("en",))
    team_m = await person(client, "team-brother", roles=("team",), gender="m", languages=("ar",))
    team_f = await person(client, "team-sister", roles=("team",), gender="f", languages=("ar",))
    return abu, joseph, daniel, team_m, team_f


# --- R9: a group whose mentor is gone -------------------------------------------


async def test_r9_suspended_mentor_group_needs_a_mentor_first_in_the_admin_list_and_everyone_is_told(client, pushes):
    org = await make_org(client, languages=("en",))
    abu = await org_mentor(client, org)
    other = await person(client, "omar-m", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    team = await person(client, "team-brother", roles=("team",), gender="m", languages=("ar",))
    admin = Person(await register(client, username="admin-2"))
    await with_roles_existing(admin, "admin")
    g = await group_with(client, abu, joseph)
    await group_with(client, other)  # an active group, created later (newest)
    await say(client, joseph, g["id"], "Assalamu alaikum brothers")
    await settle()
    pushes.clear()

    r = await client.post(f"/api/org/{org.id}/mentors/{abu.id}/suspend", headers=org.coordinator.h)
    assert r.status_code == 204, r.text
    await settle()

    rows = await staff_list(client, admin)
    assert [x["state"] for x in rows] == ["needs_mentor", "active"]  # flagged at the top
    assert rows[0]["id"] == g["id"] and rows[0]["mentor_name"] == abu.display_name
    assert "join_code" not in rows[0] and "members" not in rows[0]
    # Members and staff: one neutral notice each; no reason, no name, no organisation.
    told = {to for to, p in pushes if p["title"] in NOTICES and p["body"] == ""}
    assert {str(joseph.id), str(team.id), str(admin.id)} <= told
    assert str(abu.id) not in told
    for _, p in pushes:
        assert abu.display_name not in str(p) and "suspend" not in str(p)
    # Members read, and do not post (CMP-05 R9, build decision).
    assert await bodies(client, joseph, g["id"]) == ["Assalamu alaikum brothers"]
    got = (await client.get(f"/api/groups/{g['id']}", headers=joseph.h)).json()
    assert got["state"] == "needs_mentor"
    r = await client.post(f"/api/groups/{g['id']}/messages", json={"body": "Anyone?"}, headers=joseph.h)
    assert r.status_code == 409 and r.json()["detail"] == "group_needs_mentor"
    daniel = await person(client, "daniel", gender="m", languages=("en",))
    r = await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=daniel.h)
    assert r.status_code == 403 and r.json()["detail"] == "group_unavailable"


async def with_roles_existing(who: Person, *roles: str) -> None:
    from sqlalchemy import update

    from app.platform.models import User

    async with SessionLocal() as s:
        await s.execute(update(User).where(User.id == who.id).values(roles=list(roles)))
        await s.commit()


async def test_r9_mentor_role_removed_by_an_admin_flags_his_groups_too(client, pushes):
    abu, joseph, _, team_m, _ = await cast(client)
    admin = auth(await with_roles(client, "admin-1", "admin"))
    g = await group_with(client, abu, joseph)
    await settle()
    pushes.clear()

    r = await client.put(f"/api/admin/users/{abu.id}/roles", json={"roles": ["learner"]}, headers=admin)
    assert r.status_code == 200, r.text
    await settle()

    first = (await staff_list(client, team_m))[0]
    assert first["id"] == g["id"] and first["state"] == "needs_mentor"
    assert str(joseph.id) in {to for to, p in pushes if p["title"] in NOTICES}


async def test_r9_reinstated_mentor_takes_his_group_back_when_nobody_was_assigned(client):
    org = await make_org(client, languages=("en",))
    abu = await org_mentor(client, org)
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    g = await group_with(client, abu, joseph)
    await client.post(f"/api/org/{org.id}/mentors/{abu.id}/suspend", headers=org.coordinator.h)
    assert (await client.get(f"/api/groups/{g['id']}", headers=joseph.h)).json()["state"] == "needs_mentor"
    await client.post(f"/api/org/{org.id}/mentors/{abu.id}/reinstate", headers=org.coordinator.h)
    assert (await client.get(f"/api/groups/{g['id']}", headers=joseph.h)).json()["state"] == "active"
    await say(client, joseph, g["id"], "Welcome back")


# --- R8: assigning a mentor -------------------------------------------------------


async def test_r8_assign_respects_gender_language_standing_and_places(client, pushes):
    abu, joseph, _, team_m, _ = await cast(client)
    admin = auth(await with_roles(client, "admin-1", "admin"))
    g = await group_with(client, abu, joseph)
    await say(client, abu, g["id"], "Welcome, brothers")
    await client.put(f"/api/admin/users/{abu.id}/roles", json={"roles": ["learner"]}, headers=admin)

    sister = await person(client, "maryam", roles=("mentor",), gender="f", languages=("en",))
    tagalog = await person(client, "jose-tl", roles=("mentor",), gender="m", languages=("tl",))
    full = await person(client, "full-m", roles=("mentor",), gender="m", languages=("en",))
    await group_with(client, full, capacity=15)
    await group_with(client, full, capacity=10)  # 25 places: no room
    paused = await person(client, "paused-m", roles=("mentor",), gender="m", languages=("en",))
    assert (await client.put("/api/inbox/profile", json={"accepting": False}, headers=paused.h)).status_code == 200
    yusuf = await person(client, "yusuf", roles=("mentor",), gender="m", languages=("en", "ar"))

    r = await client.get(f"/api/staff/groups/{g['id']}/candidates", headers=team_m.h)
    assert r.status_code == 200, r.text
    assert [c["id"] for c in r.json()] == [str(yusuf.id)]  # the sister, the Tagalog speaker, the full and the paused are not offered

    url = f"/api/staff/groups/{g['id']}/mentor"
    for who, why in (
        (sister, "gender_mismatch"),
        (tagalog, "language_not_spoken"),
        (paused, "mentor_not_eligible"),
        (joseph, "mentor_not_eligible"),
    ):
        r = await client.put(url, json={"mentor_id": str(who.id)}, headers=team_m.h)
        assert r.status_code == 409 and r.json()["detail"] == why, (who.username, r.text)
    r = await client.put(url, json={"mentor_id": str(full.id)}, headers=team_m.h)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "mentor_member_limit"
    await settle()
    pushes.clear()

    r = await client.put(url, json={"mentor_id": str(yusuf.id)}, headers=team_m.h)
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "active" and r.json()["mentor_name"] == yusuf.display_name
    await settle()
    told = {to for to, p in pushes if p["title"] in NOTICES}
    assert {str(yusuf.id), str(joseph.id)} <= told
    # The new mentor leads it; members post again; the old mentor's words stay.
    mine = [x for x in (await client.get("/api/groups/mine", headers=yusuf.h)).json() if x["role"] == "mentor"]
    assert mine[0]["join_code"] == g["join_code"]
    await say(client, joseph, g["id"], "Thank you")
    assert await bodies(client, yusuf, g["id"]) == ["Welcome, brothers", "Thank you"]
    assert (await events("GroupMentorAssigned"))[0] == {"group_id": g["id"], "mentor_id": str(yusuf.id), "user_id": str(team_m.id)}


async def test_r8_only_the_team_and_admins_moderate_groups(client):
    abu, joseph, _, team_m, _ = await cast(client)
    g = await group_with(client, abu, joseph)
    reviewer = await person(client, "reviewer", roles=("sharia_reviewer",), gender="m")
    for who in (joseph, abu, reviewer):
        assert (await client.get("/api/staff/groups", headers=who.h)).status_code == 403
        r = await client.put(f"/api/staff/groups/{g['id']}/status", json={"status": "paused"}, headers=who.h)
        assert r.status_code == 403
    admin = auth(await with_roles(client, "admin-1", "admin"))
    assert (await client.get("/api/staff/groups", headers=admin)).status_code == 200
    assert (await client.get("/api/staff/groups", headers=team_m.h)).status_code == 200


# --- R8: pause, resume, close -------------------------------------------------------


async def test_r8_pause_and_resume(client):
    abu, joseph, daniel, team_m, _ = await cast(client)
    g = await group_with(client, abu, joseph)
    url = f"/api/staff/groups/{g['id']}/status"
    r = await client.put(url, json={"status": "paused"}, headers=team_m.h)
    assert r.status_code == 200 and r.json()["state"] == "paused"
    for who in (joseph, abu):
        r = await client.post(f"/api/groups/{g['id']}/messages", json={"body": "Hello"}, headers=who.h)
        assert r.status_code == 409 and r.json()["detail"] == "group_paused"
    assert (await client.get(f"/api/groups/{g['id']}/messages", headers=joseph.h)).status_code == 200
    assert (await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=daniel.h)).status_code == 403
    assert (await client.put(url, json={"status": "active"}, headers=team_m.h)).json()["state"] == "active"
    await say(client, joseph, g["id"], "Back again")
    assert [e["status"] for e in await events("GroupStatusChanged")] == ["paused", "active"]


async def test_r8_close_is_final_frees_places_and_members_may_join_another(client):
    abu, joseph, daniel, team_m, _ = await cast(client)
    g = await group_with(client, abu, joseph, capacity=15)
    await group_with(client, abu, capacity=10)  # 25 of 25
    await say(client, joseph, g["id"], "Our last words")
    url = f"/api/staff/groups/{g['id']}/status"
    assert (await client.put(url, json={"status": "closed"}, headers=team_m.h)).json()["state"] == "closed"

    r = await client.post(f"/api/groups/{g['id']}/messages", json={"body": "Hello"}, headers=joseph.h)
    assert r.status_code == 409 and r.json()["detail"] == "group_closed"
    assert await bodies(client, joseph, g["id"]) == ["Our last words"]  # members still read
    assert (await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=daniel.h)).status_code == 403
    r = await client.put(url, json={"status": "active"}, headers=team_m.h)
    assert r.status_code == 409 and r.json()["detail"] == "group_closed"
    r = await client.put(f"/api/staff/groups/{g['id']}/mentor", json={"mentor_id": str(abu.id)}, headers=team_m.h)
    assert r.status_code == 409
    # Its 15 places are free again, and Joseph may join another group.
    other = await group_with(client, abu, capacity=15)
    assert (await client.post("/api/groups/join", json={"code": other["join_code"]}, headers=joseph.h)).status_code == 200


# --- R8: reading and hiding, same gender only ---------------------------------------


async def test_r8_same_gender_staff_read_and_hide_others_do_not(client):
    abu, joseph, daniel, team_m, team_f = await cast(client)
    g = await group_with(client, abu, joseph, daniel)
    bad = await say(client, daniel, g["id"], "Send me money")
    await say(client, joseph, g["id"], "Fine")

    r = await client.get(f"/api/staff/groups/{g['id']}/messages", headers=team_f.h)
    assert r.status_code == 403 and r.json()["detail"] == "not_same_gender"
    assert (await client.post(f"/api/staff/groups/{g['id']}/messages/{bad}/hide", headers=team_f.h)).status_code == 403
    assert (await staff_list(client, team_f))[0]["can_read"] is False

    assert (await client.post(f"/api/staff/groups/{g['id']}/messages/{bad}/hide", headers=team_m.h)).status_code == 204
    assert await bodies(client, joseph, g["id"]) == ["Fine"]
    seen = (await client.get(f"/api/staff/groups/{g['id']}/messages", headers=team_m.h)).json()
    assert [(m["body"], m["hidden"]) for m in seen] == [("Send me money", True), ("Fine", False)]
    await client.get(f"/api/staff/groups/{g['id']}/messages", headers=team_m.h)
    assert await events("GroupReadByStaff") == [{"group_id": g["id"], "user_id": str(team_m.id)}]  # once a day, ids only
    async with SessionLocal() as s:
        rep = await s.scalar(select(Report).where(Report.target_id == bad))
        assert rep.reason == "team_hidden" and rep.status == "actioned"

    assert (await client.delete(f"/api/staff/groups/{g['id']}/members/{daniel.id}", headers=team_m.h)).status_code == 204
    r = await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=daniel.h)
    assert r.status_code == 403  # CMP-05 R5: no rejoin with the code


# --- CMP-02 R8: an escalated private thread, whole, for the team only ----------------


async def mentee(client, learner, mentor) -> str:
    assert (await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en"]}, headers=learner.h)).status_code == 200
    assert (await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=learner.h)).status_code == 200
    return (await client.post("/api/mentors/mine/thread", headers=learner.h)).json()["id"]


async def learner_says(client, learner, tid, body) -> dict:
    r = await client.post(f"/api/help/requests/{tid}/messages", json={"body": body}, headers=learner.h)
    assert r.status_code == 201, r.text
    return r.json()


async def team_reads(client, who, tid) -> list[str]:
    r = await client.get(f"/api/inbox/requests/{tid}", headers=who.h)
    assert r.status_code == 200, r.text
    return [m["body"] for m in r.json()["messages"]]


async def test_cmp02_r8_team_sees_the_whole_escalated_thread_and_unrelated_roles_see_nothing(client, pushes):
    abu, joseph, _, team_m, _ = await cast(client)
    omar = await person(client, "omar", roles=("mentor",), gender="m", languages=("en",))
    reviewer = await person(client, "reviewer", roles=("sharia_reviewer",), gender="m", languages=("en",))
    org = await make_org(client, languages=("en",), suffix="9")
    tid = await mentee(client, joseph, abu)
    before = [f"Before {i}" for i in range(10)]
    for b in before:
        await learner_says(client, joseph, tid, b)
    await client.post(f"/api/inbox/requests/{tid}/messages", json={"body": "I hear you"}, headers=abu.h)
    assert (await client.get(f"/api/inbox/requests/{tid}", headers=team_m.h)).status_code == 404  # not escalated yet

    r = await client.post(f"/api/inbox/requests/{tid}/urgent", headers=abu.h)
    assert r.status_code == 200 and r.json()["kind"] == "urgent"
    went = await learner_says(client, joseph, tid, "After the escalation")
    assert went["id"] == tid  # one thread: the learner keeps writing in it
    assert (await client.get("/api/mentors/mine", headers=joseph.h)).json()["thread_id"] == tid

    assert await team_reads(client, team_m, tid) == [*before, "I hear you", "After the escalation"]
    assert (await client.get("/api/inbox/requests", headers=team_m.h)).json()[0]["id"] == tid
    assert await team_reads(client, abu, tid) == [*before, "I hear you", "After the escalation"]
    # Not other mentors, not the Sharia reviewer, not a coordinator.
    assert (await client.get(f"/api/inbox/requests/{tid}", headers=omar.h)).status_code == 404
    assert tid not in [x["id"] for x in (await client.get("/api/inbox/requests", headers=omar.h)).json()]
    for who in (reviewer, org.coordinator):
        assert (await client.get(f"/api/inbox/requests/{tid}", headers=who.h)).status_code == 403
    # Each staff opening is recorded once a day, ids only; the mentor's own reads are not.
    await team_reads(client, team_m, tid)
    assert await events("EscalatedThreadRead") == [{"request_id": tid, "user_id": str(team_m.id)}]


async def test_cmp02_r8_team_sees_hidden_messages_marked_and_keeps_the_thread_after_the_mentor_is_suspended(client):
    org = await make_org(client, languages=("en",))
    abu = await org_mentor(client, org)
    omar = await person(client, "omar", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph", gender="m", languages=("en",))
    team = await person(client, "team-brother", roles=("team",), gender="m", languages=("ar",))
    tid = await mentee(client, joseph, abu)
    await learner_says(client, joseph, tid, "Something private")
    mid = (await client.post(f"/api/inbox/requests/{tid}/messages", json={"body": "Marry my sister"}, headers=abu.h)).json()
    msgs = (await client.get(f"/api/help/requests/{tid}", headers=joseph.h)).json()["messages"]
    bad = next(m["id"] for m in msgs if m["body"] == "Marry my sister")
    assert mid
    r = await client.post("/api/reports", json={"target_type": "help_message", "target_id": bad, "reason": "marriage"}, headers=joseph.h)
    assert r.status_code == 201 and r.json()["hidden_for_all"] is True
    assert (await client.post(f"/api/inbox/requests/{tid}/urgent", headers=abu.h)).status_code == 200

    got = (await client.get(f"/api/inbox/requests/{tid}", headers=team.h)).json()["messages"]
    assert [(m["body"], m["hidden"]) for m in got] == [("Something private", False), ("Marry my sister", True)]

    assert (await client.post(f"/api/org/{org.id}/mentors/{abu.id}/suspend", headers=org.coordinator.h)).status_code == 204
    assert tid not in [x["id"] for x in (await client.get("/api/inbox/requests", headers=omar.h)).json()]
    assert (await client.get(f"/api/inbox/requests/{tid}", headers=omar.h)).status_code == 404
    assert [m["body"] for m in (await client.get(f"/api/inbox/requests/{tid}", headers=team.h)).json()["messages"]] == [
        "Something private",
        "Marry my sister",
    ]


async def test_cmp02_r8_a_team_member_ends_the_escalation_and_the_thread_stays_private(client):
    abu, joseph, _, team_m, _ = await cast(client)
    tid = await mentee(client, joseph, abu)
    await learner_says(client, joseph, tid, "Help")
    await client.post(f"/api/inbox/requests/{tid}/urgent", headers=abu.h)
    r = await client.post(f"/api/inbox/requests/{tid}/messages", json={"body": "The team is here"}, headers=team_m.h)
    assert r.status_code == 201, r.text
    assert (await client.post(f"/api/inbox/requests/{tid}/close", headers=team_m.h)).status_code == 200

    assert (await client.get(f"/api/inbox/requests/{tid}", headers=team_m.h)).status_code == 404
    row = next(x for x in (await client.get("/api/inbox/requests", headers=abu.h)).json() if x["id"] == tid)
    assert row["kind"] == "mentor" and row["assigned_to_me"] is True  # still his, never claimed by the team
    assert await team_reads(client, abu, tid) == ["Help", "The team is here"]
