"""PLT-05 privacy and discreet mode, server side: one test per example that
the server takes part in (the policy page, quick exit and discreet mode are
in frontend/src/app/platform.rules.test.tsx)."""

import json

from sqlalchemy import func, select

from app.companion.models import Block, GroupMessage, HelpMessage, HelpRequest
from app.core.db import SessionLocal
from app.platform.models import PushSubscription
from tests.cmp_helpers import group_with, person, record_pushes, say, settle

SUB = "https://fcm.googleapis.com/fcm/send/layla-device"


async def _help(client, body="Can a sister talk to me?", token=None, **extra):
    headers = {"X-Help-Token": token} if token else {}
    r = await client.post("/api/help/requests", json={"lang": "en", "body": body, "gender": "f", **extra}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# R4 -----------------------------------------------------------------------


async def test_plt05_r4_erasing_a_guest_device_removes_its_conversations_from_the_server(client):
    layla = await _help(client)
    token = layla["guest_token"]
    other = await _help(client, body="Someone else, another device")
    r = await client.delete("/api/help/guest", headers={"X-Help-Token": token})
    assert r.status_code == 204
    async with SessionLocal() as s:
        left = (await s.scalars(select(HelpRequest.id))).all()
        bodies = (await s.scalars(select(HelpMessage.body))).all()
    assert [str(i) for i in left] == [other["request"]["id"]]
    assert "Can a sister talk to me?" not in bodies
    # the same token now sees nothing
    assert (await client.get("/api/help/requests", headers={"X-Help-Token": token})).json() == []


async def test_plt05_r4_erasing_without_a_device_token_deletes_nothing(client):
    await _help(client)
    assert (await client.delete("/api/help/guest")).status_code == 204
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(HelpRequest)) == 1


async def test_plt05_r4_erasing_the_device_drops_its_push_subscription(client):
    body = {"install_id": "dev-12345678", "subscription": {"endpoint": SUB, "keys": {"p256dh": "k", "auth": "a"}}}
    assert (await client.post("/api/push/subscribe", json=body)).status_code == 204
    assert (await client.post("/api/push/unsubscribe", json={"endpoint": SUB})).status_code == 204
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(PushSubscription)) == 0


# R5 -----------------------------------------------------------------------


async def test_plt05_r5_deleting_the_account_leaves_no_name_in_the_group_and_no_mentee(client, monkeypatch):
    record_pushes(monkeypatch)
    mentor = await person(client, "sister-mentor", roles=("mentor",), gender="f", languages=("en",))
    layla = await person(client, "layla-1", gender="f", languages=("en",), display_name="Quiet Palm")
    friend = await person(client, "friend-1", gender="f", languages=("en",))
    await client.put("/api/mentors/me/match", json={"gender": "f", "languages": ["en"]}, headers=layla.h)
    assert (await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=layla.h)).status_code == 200
    g = await group_with(client, mentor, layla, friend)
    await say(client, layla, g["id"], "Salam, I am new here")
    await say(client, friend, g["id"], "Welcome!")
    await settle()

    assert (await client.delete("/api/me", headers=layla.h)).status_code == 204

    group = (await client.get(f"/api/groups/{g['id']}", headers=friend.h)).json()
    assert "Quiet Palm" not in json.dumps(group, ensure_ascii=False)
    msgs = (await client.get(f"/api/groups/{g['id']}/messages", headers=friend.h)).json()
    assert [m["body"] for m in msgs] == ["Welcome!"]
    mentees = (await client.get("/api/inbox/mentees", headers=mentor.h)).json()
    assert all(m["id"] != str(layla.id) for m in mentees)
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(GroupMessage).where(GroupMessage.author_id == layla.id)) == 0
    # nothing can be recovered: the old credentials no longer work
    r = await client.post("/api/auth/login", json={"username": "layla-1", "password": "pass-1234-word"})
    assert r.status_code == 401


# R6 -----------------------------------------------------------------------


async def test_plt05_r6_account_downloads_its_own_data_and_nothing_about_others(client, monkeypatch):
    record_pushes(monkeypatch)
    mentor = await person(client, "sister-mentor", roles=("mentor",), gender="f", languages=("en",), display_name="Mentor Sara")
    layla = await person(client, "layla-1", gender="f", languages=("en",), display_name="Quiet Palm")
    friend = await person(client, "friend-1", gender="f", languages=("en",), display_name="Friend Huda")
    await client.put(
        "/api/me/learning",
        json={"completed": {"u1-l1": {"first": "2026-10-01T08:00:00Z", "last": "2026-10-01T08:00:00Z", "times": 1}}},
        headers=layla.h,
    )
    await client.put("/api/me/motivation", json={"days": ["2026-10-01"]}, headers=layla.h)
    g = await group_with(client, mentor, layla, friend)
    await say(client, layla, g["id"], "My own words")
    await say(client, friend, g["id"], "Friend's private words")
    req = (
        await client.post("/api/help/requests", json={"lang": "en", "body": "My question to a human", "gender": "f"}, headers=layla.h)
    ).json()
    await settle()

    r = await client.get("/api/me/export", headers=layla.h)
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith("attachment;")
    data = r.json()
    text = json.dumps(data, ensure_ascii=False)
    assert data["account"]["display_name"] == "Quiet Palm" and data["account"]["username"] == "layla-1"
    assert [c["lesson"] for c in data["learning"]["completed_lessons"]] == ["u1-l1"]
    assert data["motivation"]["learning_days"] == ["2026-10-01"]
    assert [m["text"] for m in data["companion"]["my_group_messages"]] == ["My own words"]
    conv = data["companion"]["conversations_with_a_human"]
    assert conv[0]["messages"][0] == {**conv[0]["messages"][0], "from": "me", "text": "My question to a human"}
    assert req["request"]["id"] not in text  # internal ids are not needed
    # nothing about anybody else, and no secret
    for other in ("Friend Huda", "friend-1", "Friend's private words", "Mentor Sara", "sister-mentor", str(friend.id), str(mentor.id)):
        assert other not in text
    for secret in ("password", "hash", "token", "endpoint", "p256dh", "join_code"):
        assert secret not in text.lower()


async def test_plt05_r6_download_needs_an_account(client):
    assert (await client.get("/api/me/export")).status_code == 401


async def test_plt05_r6_blocks_are_listed_without_who_was_blocked(client, monkeypatch):
    record_pushes(monkeypatch)
    mentor = await person(client, "sister-mentor", roles=("mentor",), gender="f", languages=("en",), display_name="Mentor Sara")
    layla = await person(client, "layla-1", gender="f", languages=("en",))
    async with SessionLocal() as s:
        s.add(Block(blocker_id=layla.id, blocked_id=mentor.id))
        await s.commit()
    data = (await client.get("/api/me/export", headers=layla.h)).json()
    assert len(data["companion"]["blocks"]) == 1
    assert str(mentor.id) not in json.dumps(data)
