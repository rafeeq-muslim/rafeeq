"""CMP-01 «أريد إنسانًا» and danger hand-off: one test per example."""

import pytest
from sqlalchemy import select

from app.companion.models import HelpMessage, HelpRequest
from app.core.db import SessionLocal
from app.core.events import publish
from tests.cmp_helpers import person, record_pushes, settle


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


def guest(token: str) -> dict:
    return {"X-Help-Token": token}


async def ask_as_guest(client, body="أحتاج من أكلمه", **extra):
    r = await client.post("/api/help/requests", json={"lang": "en", "body": body, **extra})
    assert r.status_code == 201, r.text
    return r.json()


# R1 -----------------------------------------------------------------------


async def test_cmp01_r1_request_from_lesson_keeps_only_the_source(client):
    out = await ask_as_guest(client, source="lesson")
    assert out["request"]["source"] == "lesson"
    async with SessionLocal() as s:
        req = await s.get(HelpRequest, out["request"]["id"])
        columns = {c.name: getattr(req, c.key) for c in HelpRequest.__table__.columns}
    # nothing about the lesson itself: only the word "lesson"
    assert req.source == "lesson"
    assert not any(isinstance(v, str) and "u1-" in v for v in columns.values())


# R2 -----------------------------------------------------------------------


async def test_cmp01_r2_guest_request_returns_token_and_sees_reply(client, pushes):
    out = await ask_as_guest(client)
    token = out["guest_token"]
    assert token and len(token) >= 32
    async with SessionLocal() as s:
        req = await s.get(HelpRequest, out["request"]["id"])
        assert req.guest_token_hash and req.guest_token_hash != token  # only the hash is stored
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    r = await client.post(f"/api/inbox/requests/{out['request']['id']}/messages", json={"body": "Welcome, I am here."}, headers=mentor.h)
    assert r.status_code == 201, r.text
    thread = (await client.get(f"/api/help/requests/{out['request']['id']}", headers=guest(token))).json()
    assert [m["author"] for m in thread["messages"]] == ["me", "mentor"]


async def test_cmp01_r2_other_device_cannot_open_guest_request(client):
    out = await ask_as_guest(client)
    other = (await client.post("/api/help/requests", json={"lang": "en", "body": "hello"})).json()["guest_token"]
    r = await client.get(f"/api/help/requests/{out['request']['id']}", headers=guest(other))
    assert r.status_code == 404
    assert (await client.get(f"/api/help/requests/{out['request']['id']}")).status_code == 404
    mine = (await client.get("/api/help/requests", headers=guest(other))).json()
    assert out["request"]["id"] not in [t["id"] for t in mine]


async def test_cmp01_r2_guest_requests_move_to_new_account(client):
    out = await ask_as_guest(client)
    layla = await person(client, "layla-1")
    r = await client.post("/api/help/claim", headers={**layla.h, **guest(out["guest_token"])})
    assert r.json()["moved"] == 1
    # from any device, with the account alone
    threads = (await client.get("/api/help/requests", headers=layla.h)).json()
    assert [t["id"] for t in threads] == [out["request"]["id"]]


# R3 -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    ["call me on 0551234567", "رقمي +966 55 123 4567", "رقمي ٠٥٥١٢٣٤٥٦٧", "mail me daniel@example.com", "join t.me/somegroup"],
)
async def test_cmp01_r3_phone_number_is_rejected_and_not_stored(client, body):
    r = await client.post("/api/help/requests", json={"lang": "en", "body": body})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "contact_not_allowed"
    async with SessionLocal() as s:
        assert list(await s.scalars(select(HelpMessage))) == []
        assert list(await s.scalars(select(HelpRequest))) == []


# R4 -----------------------------------------------------------------------


async def test_cmp01_r4_topic_is_shown_to_mentor(client):
    await ask_as_guest(client, body="I lost my room", topic="work_housing")
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    rows = (await client.get("/api/inbox/requests", headers=mentor.h)).json()
    assert rows[0]["topic"] == "work_housing"


# R5 -----------------------------------------------------------------------


async def test_cmp01_r5_reply_push_is_neutral(client, pushes):
    layla = await person(client, "layla-1", gender="f", languages=("en",))
    req = (await client.post("/api/help/requests", json={"lang": "en", "body": "My family found out"}, headers=layla.h)).json()["request"]
    mentor = await person(client, "um-sara", roles=("mentor",), gender="f", languages=("en",), display_name="Um Sara")
    await client.post(
        f"/api/inbox/requests/{req['id']}/messages", json={"body": "Salam, I read your message about prayer."}, headers=mentor.h
    )
    await settle()
    to_layla = [p for uid, p in pushes if uid == str(layla.id)]
    assert len(to_layla) == 1
    payload = to_layla[0]
    assert payload["title"] == "You have a new reply" and payload["body"] == ""
    blob = str(payload)
    for word in ("Um Sara", "prayer", "Salam", "Rafeeq", "Islam", "رفيق"):
        assert word not in blob


async def test_cmp01_r5_unread_reply_shows_in_threads(client):
    out = await ask_as_guest(client)
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await client.post(f"/api/inbox/requests/{out['request']['id']}/messages", json={"body": "I'm here"}, headers=mentor.h)
    threads = (await client.get("/api/help/requests", headers=guest(out["guest_token"]))).json()
    assert threads[0]["unread"] == 1
    await client.get(f"/api/help/requests/{out['request']['id']}", headers=guest(out["guest_token"]))
    threads = (await client.get("/api/help/requests", headers=guest(out["guest_token"]))).json()
    assert threads[0]["unread"] == 0


# R6 -----------------------------------------------------------------------


async def danger(ask_id="ask-123", lang="en"):
    async with SessionLocal() as s:
        await publish(s, "DangerDetected", "KNW", {"ask_id": ask_id, "lang": lang, "detector": "phrase"})
        await s.commit()


async def test_cmp01_r6_danger_event_creates_urgent_alert_first_in_inbox(client, pushes):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    team = await person(client, "team-one", roles=("team",), languages=("ar",))
    await ask_as_guest(client, body="older ordinary request")
    await danger(lang="tl")
    await settle()
    for who in (mentor, team):
        rows = (await client.get("/api/inbox/requests", headers=who.h)).json()
        assert rows[0]["kind"] == "urgent" and rows[0]["lang"] == "tl"
    notified = {uid for uid, p in pushes if p["title"] == "An urgent request is waiting"}
    assert {str(mentor.id), str(team.id)} <= notified


async def test_cmp01_r6_urgent_request_carries_no_question_text(client):
    await danger()
    out = (await client.post("/api/help/requests", json={"kind": "urgent", "source": "ask", "lang": "en", "ask_id": "ask-123"})).json()
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    thread = (await client.get(f"/api/inbox/requests/{out['request']['id']}", headers=mentor.h)).json()
    assert thread["kind"] == "urgent" and thread["lang"] == "en" and thread["messages"] == [] and thread["preview"] is None


async def test_cmp01_r6_opening_urgent_reuses_the_alert(client):
    await danger(ask_id="ask-777")
    first = (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en", "ask_id": "ask-777"})).json()
    token = first["guest_token"]
    again = (
        await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en", "ask_id": "ask-777"}, headers=guest(token))
    ).json()
    assert again["request"]["id"] == first["request"]["id"]
    async with SessionLocal() as s:
        urgent = list(await s.scalars(select(HelpRequest).where(HelpRequest.kind == "urgent")))
    assert len(urgent) == 1 and urgent[0].ask_id == "ask-777" and urgent[0].guest_token_hash is not None
