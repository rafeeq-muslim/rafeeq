"""CMP-02 mentor inbox (rewrite, PR #21): one test per example."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.companion.models import HelpRequest
from app.core.db import SessionLocal
from app.core.events import publish
from tests.cmp_helpers import group_with, person, record_pushes, settle


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def ask(client, who=None, **body):
    headers = who.h if who else {}
    json = {"lang": "en", "body": "I need someone", **body}
    if who is None and json.get("kind") != "urgent":
        json.setdefault("gender", "m")
    r = await client.post("/api/help/requests", json=json, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["request"]["id"]


async def inbox(client, mentor) -> list[dict]:
    r = await client.get("/api/inbox/requests", headers=mentor.h)
    assert r.status_code == 200, r.text
    return r.json()


async def age(request_id, hours):
    async with SessionLocal() as s:
        t = datetime.now(UTC) - timedelta(hours=hours)
        await s.execute(update(HelpRequest).where(HelpRequest.id == request_id).values(created_at=t, last_activity_at=t))
        await s.commit()


async def choose(client, learner, mentor, gender="m"):
    await client.put("/api/mentors/me/match", json={"gender": gender, "languages": ["en"]}, headers=learner.h)
    r = await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=learner.h)
    assert r.status_code == 200, r.text


# R1 -----------------------------------------------------------------------


async def test_cmp02_r1_mentor_sees_only_requests_in_his_languages(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await ask(client, lang="tl", body="Kailangan ko ng tulong")
    daniel = await ask(client, lang="en")
    assert [r["id"] for r in await inbox(client, abu)] == [daniel]


async def test_cmp02_r1_sister_request_is_hidden_from_a_brother(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    sara = await person(client, "um-sara", roles=("mentor",), gender="f", languages=("en",))
    layla = await ask(client, gender="f")
    assert await inbox(client, abu) == []
    assert [r["id"] for r in await inbox(client, sara)] == [layla]


async def test_cmp02_r1_urgent_request_is_visible_in_any_language_first(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    ordinary = await ask(client)
    rid = await ask(client, kind="urgent", lang="tl", body=None)
    rows = await inbox(client, abu)
    assert [(r["id"], r["kind"], r["lang"]) for r in rows] == [(rid, "urgent", "tl"), (ordinary, "human", "en")]


async def test_cmp02_r1_mentor_without_a_gender_sees_urgent_only(client):
    nogender = await person(client, "new-mentor", roles=("mentor",), gender=None, languages=("en",))
    await ask(client)
    urgent = await ask(client, kind="urgent", body=None)
    assert [r["id"] for r in await inbox(client, nogender)] == [urgent]


# R2 -----------------------------------------------------------------------


async def test_cmp02_r2_urgent_first_then_longest_waiting(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    newer = await ask(client, body="newer")
    older = await ask(client, body="older")
    await age(older, 2)
    urgent = await ask(client, kind="urgent", body=None)
    assert [r["id"] for r in await inbox(client, abu)] == [urgent, older, newer]


# R3 -----------------------------------------------------------------------


async def test_cmp02_r3_first_reply_claims_and_hides_from_others(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    other = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    rid = await ask(client)
    assert rid in [r["id"] for r in await inbox(client, other)]
    await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "I'll help"}, headers=abu.h)
    assert rid not in [r["id"] for r in await inbox(client, other)]
    assert [r["assigned_to_me"] for r in await inbox(client, abu) if r["id"] == rid] == [True]


async def test_cmp02_r3_request_goes_to_own_mentor_only(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    other = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph-1", gender="m", languages=("en", "tl"))
    await choose(client, joseph, abu)
    rid = await ask(client, joseph)
    assert rid in [r["id"] for r in await inbox(client, abu)]
    assert rid not in [r["id"] for r in await inbox(client, other)]


async def test_cmp02_r3_unanswered_after_a_day_opens_to_others(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    other = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    sister = await person(client, "um-sara", roles=("mentor",), gender="f", languages=("en",))
    joseph = await person(client, "joseph-1", gender="m", languages=("en",))
    await choose(client, joseph, abu)
    rid = await ask(client, joseph)
    await age(rid, 25)
    assert rid in [r["id"] for r in await inbox(client, other)]
    assert rid not in [r["id"] for r in await inbox(client, sister)]  # still same-gender


async def test_cmp02_closed_request_reopens_when_learner_writes(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    rid = await ask(client, daniel)
    await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "hello"}, headers=abu.h)
    await client.post(f"/api/inbox/requests/{rid}/close", headers=abu.h)
    assert rid not in [r["id"] for r in await inbox(client, abu)]
    await client.post(f"/api/help/requests/{rid}/messages", json={"body": "one more thing"}, headers=daniel.h)
    rows = [r for r in await inbox(client, abu) if r["id"] == rid]
    assert rows and rows[0]["status"] == "open" and rows[0]["assigned_to_me"]


# R4 -----------------------------------------------------------------------


async def test_cmp02_r4_learner_sees_availability_before_writing(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    r = await client.put("/api/inbox/profile", json={"availability": "Evenings after work"}, headers=abu.h)
    assert r.status_code == 200
    joseph = await person(client, "joseph-1", gender="m", languages=("en",))
    await choose(client, joseph, abu)
    mine = (await client.get("/api/mentors/mine", headers=joseph.h)).json()
    assert mine["mentor"]["availability"] == "Evenings after work"


async def test_cmp02_r4_paused_mentor_is_not_suggested_and_keeps_mentees(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph-1", gender="m", languages=("en",))
    await choose(client, joseph, abu)
    r = await client.put("/api/inbox/profile", json={"accepting": False}, headers=abu.h)
    assert r.json()["accepting"] is False
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en"]}, headers=daniel.h)
    assert (await client.get("/api/mentors/suggestions", headers=daniel.h)).json() == []
    assert [m["id"] for m in (await client.get("/api/inbox/mentees", headers=abu.h)).json()] == [str(joseph.id)]
    # paused: no new requests from the pool; his mentee's request and urgent ones still reach him
    pool = await ask(client)
    own = await ask(client, joseph)
    urgent = await ask(client, kind="urgent", body=None)
    assert [r["id"] for r in await inbox(client, abu)] == [urgent, own]
    assert pool not in [r["id"] for r in await inbox(client, abu)]


async def test_cmp02_r4_cap_reached_hides_him_and_group_is_not_counted(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    assert (await client.get("/api/inbox/profile", headers=abu.h)).json()["capacity"] == 8  # default
    for i in range(8):
        learner = await person(client, f"mentee-{i}", gender="m", languages=("en",))
        await choose(client, learner, abu)
    members = [await person(client, f"member-{i}", gender="m", languages=("en",)) for i in range(12)]
    g = await group_with(client, abu, *members, capacity=12)
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en"]}, headers=daniel.h)
    assert (await client.get("/api/mentors/suggestions", headers=daniel.h)).json() == []
    assert (await client.get(f"/api/groups/{g['id']}", headers=abu.h)).json()["members_count"] == 12


@pytest.mark.parametrize("capacity,code", [(10, 200), (11, 422), (0, 422)])
async def test_cmp02_r4_personal_cap_is_at_most_ten(client, capacity, code):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    assert (await client.put("/api/inbox/profile", json={"capacity": capacity}, headers=abu.h)).status_code == code


# R5 -----------------------------------------------------------------------


async def test_cmp02_r5_personal_sharia_question_goes_to_the_sharia_reviewer(client, pushes):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    reviewer = await person(client, "muhannad", roles=("sharia_reviewer",), gender="m", languages=("ar",), display_name="Muhannad")
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    await choose(client, daniel, abu)
    tid = (await client.post("/api/mentors/mine/thread", headers=daniel.h)).json()["id"]
    question = "Is my shahada valid though I did not say it in Arabic?"
    await client.post(f"/api/help/requests/{tid}/messages", json={"body": question}, headers=daniel.h)
    thread = (await client.get(f"/api/inbox/requests/{tid}", headers=abu.h)).json()
    mid = [m["id"] for m in thread["messages"] if m["author"] == "learner"][0]
    r = await client.post(f"/api/inbox/requests/{tid}/refer", json={"message_id": mid}, headers=abu.h)
    assert r.status_code == 201, r.text
    assert (await client.get(f"/api/inbox/requests/{tid}", headers=abu.h)).json()["referred"] == [mid]
    # the same message is referred once
    assert (await client.post(f"/api/inbox/requests/{tid}/refer", json={"message_id": mid}, headers=abu.h)).status_code == 409
    # Daniel knows scholars will answer him
    mine = (await client.get(f"/api/help/requests/{tid}", headers=daniel.h)).json()
    assert [(m["author"], m["body"]) for m in mine["messages"]][-1] == ("system", "scholar_referral")
    # the reviewer sees the question and its language, not who asked
    await settle()
    assert [p["title"] for uid, p in pushes if uid == str(reviewer.id)] == ["You have a new question"]  # neutral
    items = (await client.get("/api/referrals", headers=reviewer.h)).json()
    assert [(i["question"], i["lang"], i["status"]) for i in items] == [(question, "en", "open")]
    assert "Daniel" not in str(items) and "daniel-1" not in str(items)
    # the answer reaches Daniel in the same conversation, signed by no name
    r = await client.post(f"/api/referrals/{items[0]['id']}/answer", json={"body": "Yes, it is valid."}, headers=reviewer.h)
    assert r.status_code == 200 and r.json()["status"] == "answered"
    mine = (await client.get(f"/api/help/requests/{tid}", headers=daniel.h)).json()
    last = mine["messages"][-1]
    assert (last["author"], last["name"], last["body"]) == ("scholar", None, "Yes, it is valid.")
    await settle()
    assert [p["title"] for uid, p in pushes if uid == str(daniel.id)] == ["You have a new reply"]


async def test_cmp02_r5_only_the_sharia_reviewer_opens_referrals(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    for who in (abu, daniel):
        assert (await client.get("/api/referrals", headers=who.h)).status_code == 403


async def test_cmp02_r5_mentor_turns_harm_into_urgent(client, pushes):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    team = await person(client, "team-one", roles=("team",), languages=("ar",))
    tl_mentor = await person(client, "tl-mentor", roles=("mentor",), gender="m", languages=("tl",))
    rid = await ask(client, body="my sponsor hits me")
    assert await inbox(client, team) == []
    r = await client.post(f"/api/inbox/requests/{rid}/urgent", headers=abu.h)
    assert r.json()["kind"] == "urgent"
    await settle()
    for who in (team, tl_mentor):
        assert (await inbox(client, who))[0]["id"] == rid
    assert any(p["title"] == "An urgent request is waiting" for _, p in pushes)


# R6 -----------------------------------------------------------------------


async def test_cmp02_r6_guest_request_shows_handle_only(client):
    sara = await person(client, "um-sara", roles=("mentor",), gender="f", languages=("en",))
    await ask(client, gender="f")
    row = (await inbox(client, sara))[0]
    assert row["is_guest"] and row["handle"].isdigit() and len(row["handle"]) == 4
    assert set(row) == {
        "id", "handle", "is_guest", "lang", "kind", "topic", "source", "status", "preview", "unread",
        "created_at", "last_activity_at", "assigned_to_me", "can_reply", "can_close",
    }  # fmt: skip


async def status_changed(user_id, status):
    async with SessionLocal() as s:
        await publish(s, "EngagementStatusChanged", "MOT", {"install_id": "dev-x", "user_id": str(user_id), "status": status})
        await s.commit()


async def test_cmp02_r6_shared_status_is_visible(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph-1", gender="m", languages=("en",))
    await choose(client, joseph, abu)
    await client.put("/api/mentors/mine/share", json={"share": True}, headers=joseph.h)
    await status_changed(joseph.id, "at_risk")
    rows = (await client.get("/api/inbox/mentees", headers=abu.h)).json()
    assert rows[0]["display_name"] == "Joseph-1" and rows[0]["status"] == "at_risk"


async def test_cmp02_r6_unshared_mentee_shows_name_and_date_only(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await choose(client, daniel, abu)
    await status_changed(daniel.id, "at_risk")
    row = (await client.get("/api/inbox/mentees", headers=abu.h)).json()[0]
    assert row["display_name"] == "Daniel-1" and row["chosen_at"]
    assert row["status"] is None and row["status_changed_at"] is None and row["shares_progress"] is False


async def test_cmp02_r6_learner_cannot_open_inbox(client):
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await ask(client)
    for path in ("/api/inbox/requests", "/api/inbox/mentees"):
        assert (await client.get(path, headers=daniel.h)).status_code == 403
