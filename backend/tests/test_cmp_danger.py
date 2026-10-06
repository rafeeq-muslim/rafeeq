"""Danger cases (companion README fixed rule; rules.md §2.8–2.9): a danger
case becomes an urgent request at once, every mentor and team member is
alerted, the first available person answers whatever their gender, and the
request never carries the question text. The helpline numbers are bundled in
the app (frontend test `cmp_danger_*`)."""

import pytest
from sqlalchemy import select

from app.companion.models import HelpRequest
from app.core.db import SessionLocal
from app.core.events import publish
from tests.cmp_helpers import person, record_pushes, settle


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def danger(ask_id="ask-123", lang="en"):
    async with SessionLocal() as s:
        await publish(s, "DangerDetected", "KNW", {"ask_id": ask_id, "lang": lang, "detector": "phrase"})
        await s.commit()


async def test_cmp_danger_event_creates_urgent_alert_first_in_every_inbox(client, pushes):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    team = await person(client, "team-one", roles=("team",), languages=("ar",))
    r = await client.post("/api/help/requests", json={"lang": "en", "body": "older ordinary request", "gender": "m"})
    assert r.status_code == 201
    await danger(lang="tl")
    await settle()
    for who in (mentor, team):
        rows = (await client.get("/api/inbox/requests", headers=who.h)).json()
        assert rows[0]["kind"] == "urgent" and rows[0]["lang"] == "tl"
    notified = {uid for uid, p in pushes if p["title"] == "An urgent request is waiting"}
    assert {str(mentor.id), str(team.id)} <= notified


async def test_cmp_danger_urgent_request_carries_no_question_text(client):
    await danger()
    out = (await client.post("/api/help/requests", json={"kind": "urgent", "source": "ask", "lang": "en", "ask_id": "ask-123"})).json()
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    thread = (await client.get(f"/api/inbox/requests/{out['request']['id']}", headers=mentor.h)).json()
    assert thread["kind"] == "urgent" and thread["lang"] == "en" and thread["messages"] == [] and thread["preview"] is None


async def test_cmp_danger_opening_urgent_reuses_the_alert(client):
    await danger(ask_id="ask-777")
    first = (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en", "ask_id": "ask-777"})).json()
    token = first["guest_token"]
    again = (
        await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en", "ask_id": "ask-777"}, headers={"X-Help-Token": token})
    ).json()
    assert again["request"]["id"] == first["request"]["id"]
    async with SessionLocal() as s:
        urgent = list(await s.scalars(select(HelpRequest).where(HelpRequest.kind == "urgent")))
    assert len(urgent) == 1 and urgent[0].ask_id == "ask-777" and urgent[0].guest_token_hash is not None


async def test_cmp_danger_first_available_answers_whatever_the_gender(client):
    """README: private conversation is same-gender, danger excepted (research/08 §2, ⚠️ for the reviewer)."""
    sister_guest = (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en"})).json()
    assert sister_guest["request"]["gender"] is None  # an urgent request asks nothing first
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("ar",))
    rid = sister_guest["request"]["id"]
    assert rid in [r["id"] for r in (await client.get("/api/inbox/requests", headers=abu.h)).json()]
    r = await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "I am here. Are you safe now?"}, headers=abu.h)
    assert r.status_code == 201
