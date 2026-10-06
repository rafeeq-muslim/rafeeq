"""PLT-06 notifications, server side: the two push types (learning reminder,
replies from a human) each have their own switch, both off until turned on,
and what reaches a lock screen is neutral. The device side (permission asked
once after a tap, the iPhone note, a refused permission, discreet mode and
the in-app prayer reminder) is in frontend/src/app/platform.rules.test.tsx."""

import re
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.companion import notify
from app.core.db import SessionLocal
from app.platform import push
from app.platform.models import PushSubscription
from tests.conftest import auth, register

SUB = "https://fcm.googleapis.com/fcm/send/daniel-device"
RELIGIOUS = re.compile(r"رفيق|Rafeeq|صلاة|الصلاة|أذان|الله|قرآن|prayer|salah|adhan|Allah|Quran|dasal|panalangin", re.IGNORECASE)


@pytest.fixture
def sent(monkeypatch):
    out: list[tuple[str, dict]] = []

    async def send(sub, payload):
        out.append((sub.endpoint, payload))
        return True

    monkeypatch.setattr(push, "send", send)
    return out


async def _subscribe(client, token=None):
    body = {"install_id": "dev-12345678", "subscription": {"endpoint": SUB, "keys": {"p256dh": "k", "auth": "a"}}, "locale": "ar"}
    r = await client.post("/api/push/subscribe", json=body, headers=auth(token) if token else {})
    assert r.status_code == 204


async def _row() -> PushSubscription:
    async with SessionLocal() as s:
        sub = await s.scalar(select(PushSubscription).where(PushSubscription.endpoint == SUB))
        assert sub is not None
        return sub


async def _reply_to(user_id) -> int:
    async with SessionLocal() as s:
        return await notify.to_user(s, user_id, "reply", "/mentor")


# R1 -----------------------------------------------------------------------


async def test_plt06_r1_a_new_device_gets_nothing_until_it_turns_a_type_on(client, sent):
    out = await register(client)
    await _subscribe(client, out["access_token"])
    sub = await _row()
    assert sub.reminder_enabled is False and sub.replies_enabled is False
    assert await _reply_to(sub.user_id) == 0
    assert await push.run_reminders(datetime(2026, 10, 10, 20, 0, tzinfo=UTC)) == 0
    assert sent == []


# R2 -----------------------------------------------------------------------


async def test_plt06_r2_turning_the_learning_reminder_off_keeps_replies(client, sent):
    out = await register(client)
    await _subscribe(client, out["access_token"])
    assert (await client.put("/api/push/reminder", json={"endpoint": SUB, "enabled": True, "time": "21:00"})).status_code == 200
    assert (await client.put("/api/push/replies", json={"endpoint": SUB, "enabled": True})).json() == {"enabled": True}
    assert (await client.put("/api/push/reminder", json={"endpoint": SUB, "enabled": False})).json()["enabled"] is False
    sub = await _row()
    assert sub.replies_enabled is True and sub.reminder_enabled is False
    assert await _reply_to(sub.user_id) == 1
    assert sent[0][1]["tag"] == "cmp-reply"


async def test_plt06_r2_turning_replies_off_stops_them_for_a_guest_device_too(client, sent):
    await _subscribe(client)
    await client.put("/api/push/replies", json={"endpoint": SUB, "enabled": True})
    async with SessionLocal() as s:
        assert await notify.to_endpoint(s, SUB, "reply", "en", "/mentor") == 1
    await client.put("/api/push/replies", json={"endpoint": SUB, "enabled": False})
    async with SessionLocal() as s:
        assert await notify.to_endpoint(s, SUB, "reply", "en", "/mentor") == 0
    assert len(sent) == 1


async def test_plt06_r2_replies_switch_needs_a_subscribed_device(client):
    r = await client.put("/api/push/replies", json={"endpoint": SUB, "enabled": True})
    assert r.status_code == 404


# R3 / R6 -----------------------------------------------------------------


async def test_plt06_r3_lock_screen_shows_only_you_have_a_new_reply(client, sent):
    out = await register(client)
    await _subscribe(client, out["access_token"])
    await client.put("/api/push/replies", json={"endpoint": SUB, "enabled": True})
    await _reply_to((await _row()).user_id)
    payload = sent[0][1]
    assert payload["title"] == "لديك رد جديد" and payload["body"] == ""


def test_plt06_r3_r6_no_server_notification_names_rafeeq_or_a_religious_word():
    # The server never knows the device's discreet mode, so every text it
    # sends is already the neutral one (R6 holds for pushes by construction).
    texts = [t for kinds in notify.TEXTS.values() for t in kinds.values()]
    texts += [t for pair in push.REMINDER_TEXT.values() for t in pair]
    assert texts and not [t for t in texts if RELIGIOUS.search(t)]
