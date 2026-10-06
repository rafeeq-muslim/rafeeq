"""ORG-02 mentor management: one test (at least) per example."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.companion import notify
from app.companion.models import Group, GroupMember, HelpRequest, MentorLink
from app.core import ratelimit
from app.core.db import SessionLocal
from app.platform.models import Invite, User
from tests.cmp_helpers import Person, person, record_pushes, settle
from tests.conftest import register
from tests.org_helpers import make_org


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def org_mentor(client, org, username: str, gender="f", languages=("tl",), accept=True) -> Person:
    r = await client.post(f"/api/org/{org.id}/invites", headers=org.coordinator.h)
    assert r.status_code == 201, r.text
    ratelimit.reset()
    data = await register(
        client, username=username, invite_code=r.json()["code"], gender=gender, languages=list(languages), locale=languages[0]
    )
    p = Person(data)
    if accept:
        assert (await client.post("/api/inbox/rules", headers=p.h)).status_code == 200
    return p


async def mentors(client, org) -> dict:
    r = await client.get(f"/api/org/{org.id}/mentors", headers=org.coordinator.h)
    assert r.status_code == 200, r.text
    return r.json()


async def test_org02_r1_a_volunteer_signs_up_with_the_offices_code_and_becomes_its_mentor(client):
    org = await make_org(client)
    r = await client.post(f"/api/org/{org.id}/invites", headers=org.coordinator.h)
    assert r.status_code == 201
    expires = datetime.fromisoformat(r.json()["expires_at"])
    assert timedelta(days=6, hours=23) < expires - datetime.now(UTC) <= timedelta(days=7)  # open question default: 7 days
    data = await register(client, username="maria-1", invite_code=r.json()["code"], gender="f", languages=["tl"], locale="tl")
    assert data["user"]["roles"] == ["mentor"]
    rows = (await mentors(client, org))["mentors"]
    assert [(m["display_name"], m["state"]) for m in rows] == [(data["user"]["display_name"], "awaiting_rules")]


async def test_org02_r1_a_used_or_expired_code_is_refused(client):
    org = await make_org(client)
    code = (await client.post(f"/api/org/{org.id}/invites", headers=org.coordinator.h)).json()["code"]
    await register(client, username="maria-1", invite_code=code, gender="f")
    ratelimit.reset()
    r = await client.post(
        "/api/auth/register",
        json={"display_name": "X", "username": "other-1", "password": "pass-1234-word", "invite_code": code, "gender": "m"},
    )
    assert r.status_code == 400 and r.json()["detail"] == "invite_invalid"
    old = (await client.post(f"/api/org/{org.id}/invites", headers=org.coordinator.h)).json()["code"]
    async with SessionLocal() as s:
        await s.execute(update(Invite).where(Invite.code == old).values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
        await s.commit()
    r = await client.post(
        "/api/auth/register",
        json={"display_name": "Y", "username": "other-2", "password": "pass-1234-word", "invite_code": old, "gender": "m"},
    )
    assert r.status_code == 400 and r.json()["detail"] == "invite_invalid"


async def test_org02_r2_the_mentor_accepts_the_rules_before_seeing_any_request(client):
    org = await make_org(client)
    abu = await org_mentor(client, org, "abu-abdullah", gender="m", languages=("ar",), accept=False)
    r = await client.get("/api/inbox/requests", headers=abu.h)
    assert r.status_code == 403 and r.json()["detail"] == "mentor_rules_required"
    assert (await client.get("/api/inbox/rules", headers=abu.h)).json()["required"] is True
    accepted = await client.post("/api/inbox/rules", headers=abu.h)
    assert accepted.status_code == 200 and accepted.json()["required"] is False
    assert (await client.get("/api/inbox/requests", headers=abu.h)).status_code == 200
    states = [m["state"] for m in (await mentors(client, org))["mentors"]]
    assert states == ["receiving"]


async def test_org02_r2_a_mentor_who_has_not_accepted_is_not_suggested(client):
    org = await make_org(client)
    await org_mentor(client, org, "abu-abdullah", gender="m", languages=("ar",), accept=False)
    learner = await person(client, "learner-1", gender="m", languages=("ar",))
    assert (await client.get("/api/mentors/suggestions", headers=learner.h)).json() == []


async def test_org02_r3_the_coordinator_sees_load_8_of_10_and_23_of_25(client):
    org = await make_org(client)
    abu = await org_mentor(client, org, "abu-abdullah", gender="m", languages=("ar",))
    assert (await client.put("/api/inbox/profile", json={"capacity": 10}, headers=abu.h)).status_code == 200
    async with SessionLocal() as s:
        learners = [User(username=f"l-{i}", display_name=f"L{i}", password_hash="x", roles=["learner"], locale="ar") for i in range(31)]
        s.add_all(learners)
        await s.flush()
        s.add_all(MentorLink(learner_id=u.id, mentor_id=abu.id, share_progress=False) for u in learners[:8])
        groups = [Group(name=f"G{i}", lang="ar", gender="m", mentor_id=abu.id, capacity=12, join_code=f"CODE{i}") for i in range(2)]
        s.add_all(groups)
        await s.flush()
        s.add_all(GroupMember(group_id=groups[0].id, user_id=u.id) for u in learners[8:20])
        s.add_all(GroupMember(group_id=groups[1].id, user_id=u.id) for u in learners[20:31])
        await s.commit()
    row = (await mentors(client, org))["mentors"][0]
    assert (row["mentees"], row["capacity"]) == (8, 10)  # «8 من 10»
    assert (row["group_members"], row["group_limit"]) == (23, 25)  # «23 من 25»
    assert set(row) == {"id", "display_name", "languages", "gender", "state", "mentees", "capacity", "group_members", "group_limit"}


async def test_org02_r3_the_coordinator_cannot_open_a_mentors_mentees_or_conversations(client):
    org = await make_org(client)
    abu = await org_mentor(client, org, "abu-abdullah", gender="m", languages=("ar",))
    learner = await person(client, "learner-1", gender="m", languages=("ar",), display_name="Joseph Learner")
    assert (await client.post("/api/mentors/choose", json={"mentor_id": str(abu.id)}, headers=learner.h)).status_code == 200
    thread = (await client.post("/api/mentors/mine/thread", headers=learner.h)).json()["id"]
    text = (await client.get(f"/api/org/{org.id}/mentors", headers=org.coordinator.h)).text
    assert "Joseph Learner" not in text and str(learner.id) not in text
    h = org.coordinator.h
    assert (await client.get("/api/inbox/mentees", headers=h)).status_code == 403
    assert (await client.get(f"/api/inbox/requests/{thread}", headers=h)).status_code == 403
    assert (await client.get(f"/api/org/{org.id}/mentors/{abu.id}/mentees", headers=h)).status_code in (404, 405)


async def test_org02_r4_the_coordinator_sees_a_missing_sister_in_tagalog(client):
    org = await make_org(client)
    await org_mentor(client, org, "brother-tl", gender="m", languages=("tl",))
    async with SessionLocal() as s:
        t = datetime.now(UTC)
        s.add(HelpRequest(kind="human", lang="tl", handle="4821", requester_gender="f", status="open", created_at=t, last_activity_at=t))
        s.add(HelpRequest(kind="human", lang="tl", handle="4822", requester_gender="f", status="open", created_at=t, last_activity_at=t))
        await s.commit()
    out = await mentors(client, org)
    assert out["missing"] == [{"lang": "tl", "gender": "f"}]  # «ينقصكم: مرشدة بالتاغالوغية», no count
    await org_mentor(client, org, "sister-tl", gender="f", languages=("tl",))
    assert (await mentors(client, org))["missing"] == []


async def test_org02_r5_revoking_a_mentor_frees_his_mentees_and_returns_his_requests(client, pushes):
    org = await make_org(client)
    abu = await org_mentor(client, org, "abu-abdullah", gender="m", languages=("en",))
    other = await person(client, "other-mentor", roles=("mentor",), gender="m", languages=("en",))
    mentee = await person(client, "mentee-1", gender="m", languages=("en",))
    asker = await person(client, "asker-1", gender="m", languages=("en",))
    assert (await client.post("/api/mentors/choose", json={"mentor_id": str(abu.id)}, headers=mentee.h)).status_code == 200
    req = (
        await client.post("/api/help/requests", json={"kind": "human", "gender": "m", "lang": "en", "body": "A question"}, headers=asker.h)
    ).json()
    rid = req["request"]["id"]
    assert (await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "Welcome"}, headers=abu.h)).status_code == 201
    await settle()
    pushes.clear()

    r = await client.delete(f"/api/org/{org.id}/mentors/{abu.id}", headers=org.coordinator.h)
    assert r.status_code == 204
    await settle()
    mine = (await client.get("/api/mentors/mine", headers=mentee.h)).json()
    assert mine["mentor"] is None and mine["mentor_ended"] is True
    assert [uid for uid, _ in pushes] == [str(mentee.id)]
    ids = [x["id"] for x in (await client.get("/api/inbox/requests", headers=other.h)).json()]
    assert rid in ids  # back in another brother's inbox
    assert (await client.get("/api/inbox/requests", headers=abu.h)).json()["detail"] == "mentor_suspended"
    assert str(abu.id) not in (await client.get("/api/mentors/suggestions", headers=mentee.h)).text
    assert (await mentors(client, org))["mentors"] == []  # no longer the office's mentor
    # Choosing another mentor closes the notice.
    assert (await client.post("/api/mentors/choose", json={"mentor_id": str(other.id)}, headers=mentee.h)).status_code == 200
    assert (await client.get("/api/mentors/mine", headers=mentee.h)).json()["mentor_ended"] is False


async def test_org02_r5_the_notice_gives_no_reason_and_no_organisation(client, pushes):
    org = await make_org(client, name="مكتب الدعوة بالروضة")
    abu = await org_mentor(client, org, "abu-abdullah", gender="m", languages=("en",))
    mentee = await person(client, "mentee-1", gender="m", languages=("en",))
    await client.post("/api/mentors/choose", json={"mentor_id": str(abu.id)}, headers=mentee.h)
    await settle()
    pushes.clear()
    assert (await client.post(f"/api/org/{org.id}/mentors/{abu.id}/suspend", headers=org.coordinator.h)).status_code == 204
    await settle()
    ((_, payload),) = pushes
    assert payload["title"] == notify.TEXTS["mentor_change"]["en"] and payload["body"] == ""
    seen = str(payload) + (await client.get("/api/mentors/mine", headers=mentee.h)).text
    for leak in (org.name, abu.display_name, "suspend", "revok", "reason"):
        assert leak not in seen
    # Lifting the suspension gives the mentor his inbox back.
    assert (await client.post(f"/api/org/{org.id}/mentors/{abu.id}/reinstate", headers=org.coordinator.h)).status_code == 204
    assert (await client.get("/api/inbox/requests", headers=abu.h)).status_code == 200


async def test_org02_only_the_offices_coordinator_manages_its_mentors(client):
    org = await make_org(client, suffix="1")
    other = await make_org(client, name="Other office", languages=("en",), suffix="2")
    abu = await org_mentor(client, org, "abu-abdullah", gender="m", languages=("ar",))
    for h in (other.coordinator.h, abu.h):
        assert (await client.get(f"/api/org/{org.id}/mentors", headers=h)).status_code == 403
        assert (await client.post(f"/api/org/{org.id}/invites", headers=h)).status_code == 403
        assert (await client.post(f"/api/org/{org.id}/mentors/{abu.id}/suspend", headers=h)).status_code == 403
    assert (await client.post(f"/api/org/{org.id}/mentors/{uuid.uuid4()}/suspend", headers=org.coordinator.h)).status_code == 404
