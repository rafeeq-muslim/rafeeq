"""CMP-01 «أريد إنسانًا» (rewrite, PR #21): one test per example.

Danger handling left CMP-01 but stays in the companion domain: see
test_cmp_danger.py."""

import pytest
from sqlalchemy import inspect, select

from app.companion.models import HelpMessage, HelpRequest
from app.core.db import SessionLocal
from tests.cmp_helpers import person, record_pushes, settle


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


def guest(token: str) -> dict:
    return {"X-Help-Token": token}


async def ask_as_guest(client, body="أحتاج من أكلمه", gender="m", token=None, **extra):
    json = {"lang": "en", "body": body, **extra}
    if gender:
        json["gender"] = gender
    r = await client.post("/api/help/requests", json=json, headers=guest(token) if token else {})
    assert r.status_code == 201, r.text
    return r.json()


async def inbox_ids(client, who) -> list[str]:
    r = await client.get("/api/inbox/requests", headers=who.h)
    assert r.status_code == 200, r.text
    return [x["id"] for x in r.json()]


# R1 -----------------------------------------------------------------------


async def test_cmp01_r1_request_from_lesson_keeps_only_the_source(client):
    out = await ask_as_guest(client, source="lesson")
    assert out["request"]["source"] == "lesson"
    async with SessionLocal() as s:
        req = await s.get(HelpRequest, out["request"]["id"])
        columns = {a.key: getattr(req, a.key) for a in inspect(HelpRequest).column_attrs}
    # nothing about the lesson itself: only the word "lesson"
    assert req.source == "lesson"
    assert not any(isinstance(v, str) and "u1-" in v for v in columns.values())


async def test_cmp01_r1_assistant_question_is_not_attached_unless_chosen(client):
    # Daniel asked the assistant, then asked for a human without attaching his question:
    # only what he typed travels, with the random ask id; the server never adds the question.
    out = await ask_as_guest(client, body="I want to talk to someone", kind="escalation", source="ask", ask_id="ask-42")
    async with SessionLocal() as s:
        bodies = [m.body for m in await s.scalars(select(HelpMessage).where(HelpMessage.request_id == out["request"]["id"]))]
    assert bodies == ["I want to talk to someone"]
    # When he chooses to attach it, the app puts it in his own message (frontend test covers the choice).
    out = await ask_as_guest(
        client, body="My question to the assistant: …\n\nCan someone explain?", kind="escalation", source="ask", token=out["guest_token"]
    )
    assert out["request"]["source"] == "ask"


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
    out = await ask_as_guest(client, gender="f")
    other = (await ask_as_guest(client, body="hello"))["guest_token"]
    r = await client.get(f"/api/help/requests/{out['request']['id']}", headers=guest(other))
    assert r.status_code == 404
    assert (await client.get(f"/api/help/requests/{out['request']['id']}")).status_code == 404
    mine = (await client.get("/api/help/requests", headers=guest(other))).json()
    assert out["request"]["id"] not in [t["id"] for t in mine]


async def test_cmp01_r2_guest_requests_move_to_new_account(client):
    out = await ask_as_guest(client, gender="f")
    layla = await person(client, "layla-1")
    r = await client.post("/api/help/claim", headers={**layla.h, **guest(out["guest_token"])})
    assert r.json()["moved"] == 1
    # from any device, with the account alone
    threads = (await client.get("/api/help/requests", headers=layla.h)).json()
    assert [t["id"] for t in threads] == [out["request"]["id"]]


# R3 -----------------------------------------------------------------------


async def test_cmp01_r3_sister_request_is_seen_by_sisters_only(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    sara = await person(client, "um-sara", roles=("mentor",), gender="f", languages=("en",))
    team_sister = await person(client, "team-sister", roles=("team",), gender="f", languages=("en",))
    team_brother = await person(client, "team-brother", roles=("team",), gender="m", languages=("en",))
    out = await ask_as_guest(client, gender="f")
    rid = out["request"]["id"]
    assert out["request"]["gender"] == "f"
    assert rid in await inbox_ids(client, sara)
    assert rid in await inbox_ids(client, team_sister)
    assert rid not in await inbox_ids(client, abu)
    assert rid not in await inbox_ids(client, team_brother)
    # a brother cannot open or answer it either
    assert (await client.get(f"/api/inbox/requests/{rid}", headers=abu.h)).status_code == 404
    r = await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "hello"}, headers=abu.h)
    assert r.status_code == 404


async def test_cmp01_r3_guest_is_asked_once(client):
    sara = await person(client, "um-sara", roles=("mentor",), gender="f", languages=("en",))
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    # never asked yet: the request cannot go out without the answer
    r = await client.post("/api/help/requests", json={"lang": "en", "body": "hello"})
    assert r.status_code == 422 and r.json()["detail"] == "gender_required"
    first = await ask_as_guest(client, gender="f")
    # a new request from the same device, without asking again
    second = await ask_as_guest(client, body="another question", gender=None, token=first["guest_token"])
    assert second["request"]["gender"] == "f"
    assert second["request"]["id"] in await inbox_ids(client, sara)
    assert second["request"]["id"] not in await inbox_ids(client, abu)


async def test_cmp01_r3_account_uses_its_own_gender(client):
    layla = await person(client, "layla-1", gender="f", languages=("en",))
    r = await client.post("/api/help/requests", json={"lang": "en", "body": "hello", "gender": "m"}, headers=layla.h)
    assert r.status_code == 201 and r.json()["request"]["gender"] == "f"


async def test_cmp01_r3_no_sister_free_waits_and_never_goes_to_a_brother(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await person(client, "ar-sister", roles=("mentor",), gender="f", languages=("ar",))  # a sister, not in Layla's language
    paused = await person(client, "paused-sister", roles=("mentor",), gender="f", languages=("en",))
    await client.put("/api/inbox/profile", json={"accepting": False}, headers=paused.h)
    out = await ask_as_guest(client, gender="f")
    token = out["guest_token"]
    assert out["request"]["awaiting_same_gender"] is True  # «ستردّ عليك أخت حين تتاح»
    assert out["request"]["id"] not in await inbox_ids(client, abu)
    # a sister in her language becomes available: the same request reaches her
    sara = await person(client, "um-sara", roles=("mentor",), gender="f", languages=("en",))
    threads = (await client.get("/api/help/requests", headers=guest(token))).json()
    assert threads[0]["awaiting_same_gender"] is False
    assert out["request"]["id"] in await inbox_ids(client, sara)
    assert out["request"]["id"] not in await inbox_ids(client, abu)


# R4 -----------------------------------------------------------------------


async def test_cmp01_r4_topic_is_shown_to_responder(client):
    await ask_as_guest(client, body="I lost my room", topic="work_housing")
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    rows = (await client.get("/api/inbox/requests", headers=mentor.h)).json()
    assert rows[0]["topic"] == "work_housing"


@pytest.mark.parametrize("topic", ["religion", "family", "work_housing", "money", "feeling_low", "other"])
async def test_cmp01_r4_topics_include_non_religious_ones(client, topic):
    assert (await ask_as_guest(client, topic=topic))["request"]["topic"] == topic


# R5 -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    ["call me on 0551234567", "رقمي +966 55 123 4567", "رقمي ٠٥٥١٢٣٤٥٦٧", "mail me daniel@example.com", "join t.me/somegroup"],
)
async def test_cmp01_r5_contact_details_are_not_sent(client, body):
    r = await client.post("/api/help/requests", json={"lang": "en", "body": body, "gender": "m"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "contact_not_allowed"
    async with SessionLocal() as s:
        assert list(await s.scalars(select(HelpMessage))) == []
        assert list(await s.scalars(select(HelpRequest))) == []


async def test_cmp01_r5_contact_details_refused_in_follow_up_messages(client):
    out = await ask_as_guest(client)
    r = await client.post(
        f"/api/help/requests/{out['request']['id']}/messages", json={"body": "my whatsapp wa.me/123"}, headers=guest(out["guest_token"])
    )
    assert r.status_code == 422 and r.json()["detail"] == {"code": "contact_not_allowed", "kind": "link"}


# R6 -----------------------------------------------------------------------


async def test_cmp01_r6_reply_push_is_neutral(client, pushes):
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


async def test_cmp01_r6_arabic_push_reads_lak_rad_jadid(client, pushes):
    layla = await person(client, "layla-ar", gender="f", languages=("ar",), locale="ar")
    req = (await client.post("/api/help/requests", json={"lang": "ar", "body": "أحتاج أختًا"}, headers=layla.h)).json()["request"]
    sara = await person(client, "um-sara", roles=("mentor",), gender="f", languages=("ar",))
    await client.post(f"/api/inbox/requests/{req['id']}/messages", json={"body": "حياك الله"}, headers=sara.h)
    await settle()
    assert [p["title"] for uid, p in pushes if uid == str(layla.id)] == ["لديك رد جديد"]


async def test_cmp01_r6_unread_reply_shows_in_threads(client):
    out = await ask_as_guest(client)
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await client.post(f"/api/inbox/requests/{out['request']['id']}/messages", json={"body": "I'm here"}, headers=mentor.h)
    threads = (await client.get("/api/help/requests", headers=guest(out["guest_token"]))).json()
    assert threads[0]["unread"] == 1
    await client.get(f"/api/help/requests/{out['request']['id']}", headers=guest(out["guest_token"]))
    threads = (await client.get("/api/help/requests", headers=guest(out["guest_token"]))).json()
    assert threads[0]["unread"] == 0
