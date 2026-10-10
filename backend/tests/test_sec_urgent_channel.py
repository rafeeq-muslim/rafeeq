"""Security review 2026-10-07, A-H4 / B-M2 (server part): the urgent (danger)
channel can be neither blocked nor used to push every mentor again and again.

rules.md §2.8: danger goes to a human. So an urgent request is never refused
because of how many there are; the push to everyone is what is limited."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.companion import notify, urgent
from app.companion.models import HelpRequest
from app.core import limits
from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.main import app
from tests.cmp_helpers import person, record_pushes, settle

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

URGENT_TITLE = "An urgent request is waiting"
DANGER = "My family kicked me out of the house because I became Muslim"


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


def device(n: int) -> AsyncClient:
    """A device at its own address (TEST-NET-3 documentation addresses)."""
    return AsyncClient(transport=ASGITransport(app=app, client=(f"203.0.113.{n}", 50000)), base_url="http://test")


async def urgent_rows() -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(func.count()).select_from(HelpRequest).where(HelpRequest.kind == "urgent")) or 0


def rounds(pushes, who) -> int:
    return sum(1 for uid, p in pushes if uid == str(who.id) and p["title"] == URGENT_TITLE)


async def test_sec_a_h4_a_flood_never_closes_the_urgent_door(client, pushes):
    """Before: the 61st urgent request of the hour, from anyone, got 429."""
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    team = await person(client, "team-one", roles=("team",))
    for n in range(1, 71):
        async with device(n) as d:
            r = await d.post("/api/help/requests", json={"kind": "urgent", "lang": "en"})
        assert r.status_code == 201, (n, r.text)
    await settle()
    assert await urgent_rows() == 70  # every one is kept and shown first in every inbox
    rows = (await client.get("/api/inbox/requests", headers=mentor.h)).json()
    assert len([r for r in rows if r["kind"] == "urgent"]) == 70
    # the mentors are pushed up to the cap; over it only the team hears, once per ten minutes
    cap = limits.get("urgent_pushes_per_hour")  # admin-editable, default 20 (plt-admin-limits)
    assert cap == 20
    assert rounds(pushes, mentor) == cap
    assert rounds(pushes, team) == cap + 1


async def test_sec_a_h4_the_address_limit_stays(client):
    for _ in range(3):
        assert (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en"})).status_code == 201
    assert (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en"})).status_code == 429


async def test_sec_a_h4_words_in_one_urgent_request_push_everyone_once(client, pushes):
    """Before: each of 30 messages a minute pushed every mentor and team member."""
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    out = (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en"})).json()
    h = {"X-Help-Token": out["guest_token"]}
    for i in range(6):
        r = await client.post(f"/api/help/requests/{out['request']['id']}/messages", json={"body": f"please help {i}"}, headers=h)
        assert r.status_code == 201, r.text
    await settle()
    assert rounds(pushes, mentor) == 1


async def test_sec_a_h4_a_held_urgent_request_pushes_its_holder_and_the_team_once(client, pushes):
    """B-M3: a held urgent request is its holder's and the team's. The holder
    hears every message, the team once per window, other mentors nothing."""
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    other = await person(client, "abu-omar", roles=("mentor",), gender="m")
    team = await person(client, "team-one", roles=("team",))
    out = (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en"})).json()
    rid, h = out["request"]["id"], {"X-Help-Token": out["guest_token"]}
    assert (await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "I am here"}, headers=mentor.h)).status_code == 201
    await settle()
    pushes.clear()
    for i in range(4):
        await client.post(f"/api/help/requests/{rid}/messages", json={"body": f"thank you {i}"}, headers=h)
    await settle()
    assert rounds(pushes, mentor) == 4 and rounds(pushes, team) == 1 and rounds(pushes, other) == 0


async def test_sec_a_h4_a_push_the_full_queue_would_drop_does_not_use_the_turn(client, pushes, monkeypatch):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    out = (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en"})).json()
    rid, h = out["request"]["id"], {"X-Help-Token": out["guest_token"]}
    await settle()
    assert rounds(pushes, mentor) == 1
    assert urgent.alert("another-request") == "all"
    await settle()
    monkeypatch.setattr(notify, "MAX_WAITING", 0)  # the queue is full
    assert urgent.alert("third-request") == "none"
    monkeypatch.undo()
    assert urgent.alert("third-request") == "all"  # its turn was not used up while the queue was full
    await settle()
    assert (await client.post(f"/api/help/requests/{rid}/messages", json={"body": "hello"}, headers=h)).status_code == 201


async def test_sec_a_h4_danger_phrases_from_one_asker_raise_one_alert(client, ai, pushes):
    """Before: every danger phrase in /api/ask (no model call, 8 a minute) made
    a new urgent alert and pushed everyone."""
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    for _ in range(5):
        r = await client.post("/api/ask", json={"question": DANGER, "lang": "en"})
        assert r.status_code == 200 and r.json()["outcome"] == "danger"  # the asker always gets the danger reply
        assert r.json()["handoff"] == {"kind": "urgent", "lang": "en"}
    await settle()
    assert await urgent_rows() == 1
    assert rounds(pushes, mentor) == 1
    async with SessionLocal() as s:
        events = list(await s.scalars(select(OutboxEvent).where(OutboxEvent.name == "DangerDetected").order_by(OutboxEvent.created_at)))
    assert len(events) == 5 and [bool(e.payload.get("repeat")) for e in events].count(True) == 4
    assert all(set(e.payload) <= {"ask_id", "lang", "detector", "repeat"} for e in events)  # still no identity, no text


async def test_sec_a_h4_danger_alerts_are_limited_per_address(client, ai, pushes):
    """Free accounts do not multiply the alerts one address can raise."""
    people = [await person(client, f"asker-{i}") for i in range(5)]  # (person() resets the limiter)
    for p in people:
        r = await client.post("/api/ask", json={"question": DANGER, "lang": "en"}, headers=p.h)
        assert r.json()["outcome"] == "danger"
    assert await urgent_rows() == 3


async def test_sec_a_h4_the_asker_still_reaches_a_human_after_a_repeat(client, ai, pushes):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    await client.post("/api/ask", json={"question": DANGER, "lang": "en"})
    second = (await client.post("/api/ask", json={"question": DANGER, "lang": "en"})).json()
    r = await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en", "source": "ask", "ask_id": second["ask_id"]})
    assert r.status_code == 201
    await settle()
    assert await urgent_rows() == 2  # the first alert, and the request this person opened
    assert rounds(pushes, mentor) == 2
