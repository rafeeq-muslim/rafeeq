"""Security review 2026-10-07, A-M4: a conversation is read in pages (the last
200 messages, then earlier ones on demand), takes a bounded number of
messages a day, and a guest's messages are also limited by address."""

from datetime import UTC, datetime, timedelta

import pytest

from app.companion.common import THREAD_MSGS_PER_DAY, THREAD_PAGE
from app.companion.models import HelpMessage
from app.core import ratelimit
from app.core.db import SessionLocal
from tests.cmp_helpers import person, record_pushes


@pytest.fixture(autouse=True)
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def guest_request(client) -> tuple[str, dict]:
    r = await client.post("/api/help/requests", json={"lang": "en", "body": "first words", "gender": "m"})
    assert r.status_code == 201, r.text
    return r.json()["request"]["id"], {"X-Help-Token": r.json()["guest_token"]}


async def fill(request_id: str, n: int) -> None:
    """`n` more learner messages, one second apart, older than the request's own."""
    start = datetime.now(UTC) - timedelta(days=2)
    async with SessionLocal() as s:
        s.add_all(
            HelpMessage(request_id=request_id, author="learner", body=f"m{i:04d}", created_at=start + timedelta(seconds=i)) for i in range(n)
        )
        await s.commit()


async def test_m4_the_learner_reads_the_last_200_and_earlier_ones_on_demand(client):
    rid, h = await guest_request(client)
    await fill(rid, 449)  # 450 with the first message
    page = (await client.get(f"/api/help/requests/{rid}", headers=h)).json()
    assert THREAD_PAGE == 200 and len(page["messages"]) == 200 and page["has_earlier"] is True
    assert [m["body"] for m in page["messages"]][-2:] == ["m0448", "first words"]

    seen = [m["body"] for m in page["messages"]]
    while page["has_earlier"]:
        page = (await client.get(f"/api/help/requests/{rid}", params={"before": page["messages"][0]["id"]}, headers=h)).json()
        assert 0 < len(page["messages"]) <= 200
        seen = [m["body"] for m in page["messages"]] + seen
    assert seen == [f"m{i:04d}" for i in range(449)] + ["first words"]  # every message once, in order


async def test_m4_a_short_conversation_is_one_page(client):
    rid, h = await guest_request(client)
    page = (await client.get(f"/api/help/requests/{rid}", headers=h)).json()
    assert [m["body"] for m in page["messages"]] == ["first words"] and page["has_earlier"] is False


async def test_m4_the_cursor_only_works_inside_ones_own_conversation(client):
    rid, h = await guest_request(client)
    other, other_h = await guest_request(client)
    theirs = (await client.get(f"/api/help/requests/{other}", headers=other_h)).json()["messages"][0]["id"]
    assert (await client.get(f"/api/help/requests/{rid}", params={"before": theirs}, headers=h)).status_code == 404
    assert (await client.get(f"/api/help/requests/{other}", params={"before": theirs}, headers=h)).status_code == 404


async def test_m4_the_responder_reads_the_last_200_and_earlier_ones_on_demand(client):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    rid, _ = await guest_request(client)
    await fill(rid, 250)
    page = (await client.get(f"/api/inbox/requests/{rid}", headers=mentor.h)).json()
    assert len(page["messages"]) == 200 and page["has_earlier"] is True
    earlier = (await client.get(f"/api/inbox/requests/{rid}", params={"before": page["messages"][0]["id"]}, headers=mentor.h)).json()
    assert [m["body"] for m in earlier["messages"]] == [f"m{i:04d}" for i in range(51)] and earlier["has_earlier"] is False


def forget_minute_limit(rid: str) -> None:
    """Drop the conversation's per-minute counter (the limiter may keep its keys as digests)."""
    key = f"help-msg:{rid}"
    digest = getattr(ratelimit, "_digest", None)
    ratelimit._hits.pop(key, None)
    if digest is not None:
        ratelimit._hits.pop(digest(key), None)


async def test_m4_a_conversation_takes_a_bounded_number_of_messages_a_day(client):
    layla = await person(client, "layla-1", gender="f")
    r = await client.post("/api/help/requests", json={"lang": "en", "body": "first words"}, headers=layla.h)
    rid = r.json()["request"]["id"]
    for i in range(THREAD_MSGS_PER_DAY):
        if i % 30 == 0:
            forget_minute_limit(rid)  # the per-minute limit is not what is tested here
        assert (await client.post(f"/api/help/requests/{rid}/messages", json={"body": "more"}, headers=layla.h)).status_code == 201
    forget_minute_limit(rid)
    assert (await client.post(f"/api/help/requests/{rid}/messages", json={"body": "more"}, headers=layla.h)).status_code == 429


async def test_m4_guest_messages_are_limited_by_address_across_conversations(client):
    threads = [await guest_request(client) for _ in range(3)]
    sent = 0
    for rid, h in threads:
        for _ in range(20):
            assert (await client.post(f"/api/help/requests/{rid}/messages", json={"body": "more"}, headers=h)).status_code == 201
            sent += 1
    assert sent == 60
    rid, h = threads[0]
    assert (await client.post(f"/api/help/requests/{rid}/messages", json={"body": "more"}, headers=h)).status_code == 429
    # an account's messages are not counted by address
    layla = await person(client, "layla-1", gender="f")
    mine = (await client.post("/api/help/requests", json={"lang": "en", "body": "hello"}, headers=layla.h)).json()["request"]["id"]
    assert (await client.post(f"/api/help/requests/{mine}/messages", json={"body": "more"}, headers=layla.h)).status_code == 201
