"""Security review 2026-10-07, B-M5: the contact filter (CMP-01 R5) never runs
on the event loop. The patterns were made linear by the hotfix
(tests/test_cmp01_r5_contact_filter_time.py, A-H1, which holds the time
budget); this file tests the second layer (`clean_body_async`) and that
collapsing the spacing hides nothing and adds no false alarm."""

import asyncio
import time

import pytest
from fastapi import HTTPException

from app.companion import text
from app.companion.text import MAX_BODY, clean_body_async, contact_violation

REVIEW_SHAPE = ("name at mail" + "  dot  ab" * 300)[:MAX_BODY]  # the shape measured in the review, at the longest length


@pytest.mark.parametrize(
    "kind,body",
    [
        # the rewritten patterns still see through spacing and line breaks
        ("email", "name   at   mail   dot   com"),
        ("email", "name\nat\nmail\ndot\ncom"),
        ("email", "name ( at ) mail [ dot ] co { dot } uk"),
        ("email", "name  @  mail . example . org"),
        ("email", "write   to name   at   gmail"),
        ("link", "a..example.com"),
        ("link", "see sub.domain.example.org now"),
        ("handle", "snap   :   layla_k"),
        ("handle", "واتس   اب   layla_99"),
        ("handle", "my insta\nis\nlayla.k"),
    ],
)
def test_sec_a_h1_spacing_does_not_hide_a_contact(kind, body):
    assert contact_violation(body) == kind


@pytest.mark.parametrize("body", ["verses 255\n256\n257", "my_file.com is not read as a link today", "1\n2\n3\n4\n5\n6\n7\n8"])
def test_sec_a_h1_collapsing_spaces_adds_no_false_alarm(body):
    assert contact_violation(body) is None


async def test_sec_b_m5_the_scan_runs_off_the_event_loop(monkeypatch):
    """A scan that takes long (here: 0.3 s on purpose) leaves the loop free."""

    def slow(body: str) -> None:
        time.sleep(0.3)

    monkeypatch.setattr(text, "contact_violation", slow)
    ticks = 0

    async def other_requests() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    task = asyncio.create_task(other_requests())
    assert await clean_body_async("السلام عليكم") == "السلام عليكم"
    task.cancel()
    assert ticks >= 10  # on the loop this would be 0


async def test_sec_b_m5_a_scan_that_does_not_finish_refuses_the_message(monkeypatch):
    monkeypatch.setattr(text, "CHECK_TIMEOUT_S", 0.05)
    monkeypatch.setattr(text, "contact_violation", lambda body: time.sleep(0.3))
    with pytest.raises(HTTPException) as e:
        await clean_body_async("hello")
    assert e.value.status_code == 422 and e.value.detail == "message_not_checked"


async def test_sec_b_m5_a_guest_message_of_the_review_shape_is_accepted(client):
    r = await client.post("/api/help/requests", json={"lang": "en", "gender": "f", "body": REVIEW_SHAPE})
    assert r.status_code == 201, r.text
    r = await client.post("/api/help/requests", json={"lang": "en", "gender": "f", "body": "name   at   mail   dot   com"})
    assert r.status_code == 422 and r.json()["detail"] == {"code": "contact_not_allowed", "kind": "email"}
