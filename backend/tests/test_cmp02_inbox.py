"""CMP-02 mentor inbox: one test per example."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.companion.models import HelpRequest
from app.core.db import SessionLocal
from app.core.events import publish
from tests.cmp_helpers import person, record_pushes, settle


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def ask(client, who=None, **body):
    headers = who.h if who else {}
    r = await client.post("/api/help/requests", json={"lang": "en", "body": "I need someone", **body}, headers=headers)
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


# R1 -----------------------------------------------------------------------


async def test_cmp02_r1_mentor_sees_only_requests_in_his_languages(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await ask(client, lang="tl", body="Kailangan ko ng tulong")
    daniel = await ask(client, lang="en")
    assert [r["id"] for r in await inbox(client, abu)] == [daniel]


async def test_cmp02_r1_gender_preference_hides_request_from_other_gender(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    sara = await person(client, "um-sara", roles=("mentor",), gender="f", languages=("en",))
    layla = await ask(client, prefer_gender="f")
    assert await inbox(client, abu) == []
    assert [r["id"] for r in await inbox(client, sara)] == [layla]


async def test_cmp02_r1_urgent_request_is_visible_in_any_language(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    rid = await ask(client, kind="urgent", lang="tl", body=None)
    rows = await inbox(client, abu)
    assert [(r["id"], r["kind"], r["lang"]) for r in rows] == [(rid, "urgent", "tl")]


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


async def choose(client, learner, mentor):
    await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en"]}, headers=learner.h)
    r = await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=learner.h)
    assert r.status_code == 200, r.text


async def test_cmp02_r3_request_goes_to_own_mentor_only(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    other = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph-1", gender="m", languages=("en", "tl"))
    await choose(client, joseph, abu)
    rid = await ask(client, joseph)
    assert rid in [r["id"] for r in await inbox(client, abu)]
    assert rid not in [r["id"] for r in await inbox(client, other)]


async def test_cmp02_r3_unanswered_after_24h_opens_to_pool(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    other = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph-1", gender="m", languages=("en",))
    await choose(client, joseph, abu)
    rid = await ask(client, joseph)
    await age(rid, 25)
    assert rid in [r["id"] for r in await inbox(client, other)]


# R4 -----------------------------------------------------------------------


async def test_cmp02_r4_learner_message_reopens_closed_request(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    rid = await ask(client, daniel)
    await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "hello"}, headers=abu.h)
    await client.post(f"/api/inbox/requests/{rid}/close", headers=abu.h)
    assert rid not in [r["id"] for r in await inbox(client, abu)]
    await client.post(f"/api/help/requests/{rid}/messages", json={"body": "one more thing"}, headers=daniel.h)
    rows = [r for r in await inbox(client, abu) if r["id"] == rid]
    assert rows and rows[0]["status"] == "open" and rows[0]["assigned_to_me"]


async def test_cmp02_r4_mentor_escalates_to_urgent(client, pushes):
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


# R5 -----------------------------------------------------------------------


async def test_cmp02_r5_guest_request_shows_handle_only(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await ask(client)
    row = (await inbox(client, abu))[0]
    assert row["is_guest"] and row["handle"].isdigit() and len(row["handle"]) == 4
    assert set(row) == {
        "id", "handle", "is_guest", "lang", "kind", "topic", "source", "status", "preview", "unread",
        "created_at", "last_activity_at", "assigned_to_me", "can_reply",
    }  # fmt: skip


# R6 -----------------------------------------------------------------------


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
