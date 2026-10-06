"""PLT-13 notifications on iPhone, server side (R3 sending to Apple, R4 silent
re-subscribe, R5 «جرّب الإشعار», R6 in-app links). The device side is in
frontend/src/app/plt13.rules.test.tsx and frontend/src/sw/plt13-push.test.ts.
The live check against Apple is manual: backend/scripts/apple_push_probe.py."""

import json
import logging
import re
from types import SimpleNamespace

import pytest
import requests
from pywebpush import WebPushException
from sqlalchemy import select

from app.core.db import SessionLocal
from app.platform import push
from app.platform.models import PushSubscription

APPLE = "https://web.push.apple.com/QLAYLA-device-token"
APPLE_NEW = "https://web.push.apple.com/QLAYLA-new-token"
INSTALL = "layla-install-1"
RELIGIOUS = re.compile(r"رفيق|Rafeeq|صلاة|الله|قرآن|prayer|Allah|Quran|Islam|إسلام", re.IGNORECASE)


@pytest.fixture
def webpush_calls(monkeypatch):
    """Capture what would go to the push service; `answer` sets its status code."""
    calls: list[dict] = []
    state = SimpleNamespace(answer=201)

    def fake(**kw):
        calls.append(kw)
        if state.answer >= 400:
            r = requests.Response()
            r.status_code = state.answer
            raise WebPushException("push service said no", response=r)

    monkeypatch.setattr(push, "webpush", fake)
    real = push.get_settings()
    monkeypatch.setattr(push, "get_settings", lambda: SimpleNamespace(vapid_private_key="test-key", vapid_subject=real.vapid_subject))
    calls_state = SimpleNamespace(calls=calls, state=state)
    return calls_state


async def _subscribe(client, endpoint=APPLE, install=INSTALL, locale="ar"):
    body = {"install_id": install, "subscription": {"endpoint": endpoint, "keys": {"p256dh": "k", "auth": "a"}}, "locale": locale}
    r = await client.post("/api/push/subscribe", json=body)
    assert r.status_code == 204, r.text


async def _row(endpoint=APPLE) -> PushSubscription | None:
    async with SessionLocal() as s:
        return await s.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))


def _sub(**kw) -> PushSubscription:
    base = dict(
        endpoint=APPLE,
        p256dh="k",
        auth="a",
        reminder_enabled=True,
        reminder_time="21:00",
        timezone="Asia/Riyadh",
        ignored_in_row=0,
        locale="ar",
    )
    return PushSubscription(**{**base, **kw})


# R3 -----------------------------------------------------------------------


async def test_plt13_r3_a_reminder_to_apple_is_sent_with_ttl_and_normal_urgency(webpush_calls):
    assert await push.send(_sub(), {"title": "لحظة لك", "body": "…", "url": "/next", "tag": "reminder"}) is True
    call = webpush_calls.calls[0]
    assert call["subscription_info"]["endpoint"] == APPLE
    assert call["ttl"] == 6 * 3600
    assert call["headers"] == {"Urgency": "normal"}
    assert call["vapid_claims"]["sub"].startswith("mailto:")  # a real address, as Apple requires


async def test_plt13_r3_a_reply_goes_with_high_urgency(webpush_calls):
    await push.send(_sub(), {"title": "لديك رد جديد", "body": "", "url": "/mentor", "tag": "cmp-reply"})
    assert webpush_calls.calls[0]["headers"] == {"Urgency": "high"}


async def test_plt13_r3_apple_410_drops_the_subscription_and_me_shows_it_off(client, webpush_calls):
    await _subscribe(client)
    await client.put("/api/push/reminder", json={"endpoint": APPLE, "enabled": True, "time": "21:00"})
    await client.put("/api/push/replies", json={"endpoint": APPLE, "enabled": True})
    webpush_calls.state.answer = 410
    async with SessionLocal() as s:
        sub = await s.scalar(select(PushSubscription).where(PushSubscription.endpoint == APPLE))
        assert await push.send(sub, {"title": "t", "tag": "reminder"}) is False
        await s.commit()
    row = await _row()
    assert row.failed_at is not None and row.reminder_enabled is False
    got = (await client.post("/api/push/state", json={"endpoint": APPLE})).json()
    assert got == {"subscribed": False, "reminder": False, "time": None, "replies": False}


async def test_plt13_r3_a_rejected_signature_keeps_the_subscription_and_logs_for_the_team(client, webpush_calls, caplog):
    await _subscribe(client)
    await client.put("/api/push/reminder", json={"endpoint": APPLE, "enabled": True, "time": "21:00"})
    webpush_calls.state.answer = 403
    async with SessionLocal() as s:
        sub = await s.scalar(select(PushSubscription).where(PushSubscription.endpoint == APPLE))
        with caplog.at_level(logging.ERROR, logger="app.platform.push"):
            assert await push.send(sub, {"title": "t", "tag": "reminder"}) is False
        await s.commit()
    row = await _row()
    assert row.failed_at is None and row.reminder_enabled is True
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors and "403" in errors[0].getMessage()
    assert "QLAYLA" not in caplog.text and INSTALL not in caplog.text  # no device or person in the log


async def test_plt13_r3_an_unknown_push_service_is_refused(client, webpush_calls):
    body = {"install_id": INSTALL, "subscription": {"endpoint": "https://push.evil.example/x", "keys": {"p256dh": "k", "auth": "a"}}}
    assert (await client.post("/api/push/subscribe", json=body)).status_code == 422
    assert await push.send(_sub(endpoint="https://push.evil.example/x"), {"title": "t"}) is False
    assert webpush_calls.calls == []


# R4 -----------------------------------------------------------------------


async def test_plt13_r4_a_renewed_subscription_keeps_the_same_reminder_time(client):
    await _subscribe(client)
    await client.put("/api/push/reminder", json={"endpoint": APPLE, "enabled": True, "time": "21:00"})
    await client.post("/api/push/learned", json={"endpoint": APPLE, "day": "2026-10-05"})
    body = {
        "install_id": INSTALL,
        "subscription": {"endpoint": APPLE_NEW, "keys": {"p256dh": "k2", "auth": "a2"}},
        "locale": "ar",
        "old_endpoint": APPLE,
        "reminder": True,
        "time": "21:00",
        "replies": False,
    }
    r = await client.post("/api/push/resubscribe", json=body)
    assert r.json() == {"subscribed": True, "reminder": True, "time": "21:00", "replies": False}
    new = await _row(APPLE_NEW)
    assert new.reminder_enabled is True and new.reminder_time == "21:00" and new.last_learned_on == "2026-10-05"
    assert new.p256dh == "k2"
    assert await _row(APPLE) is None


async def test_plt13_r4_another_install_cannot_take_a_subscriptions_history(client):
    await _subscribe(client)
    await client.post("/api/push/learned", json={"endpoint": APPLE, "day": "2026-10-05"})
    body = {
        "install_id": "someone-else-1",
        "subscription": {"endpoint": APPLE_NEW, "keys": {"p256dh": "k", "auth": "a"}},
        "old_endpoint": APPLE,
        "replies": True,
    }
    assert (await client.post("/api/push/resubscribe", json=body)).status_code == 200
    assert (await _row(APPLE_NEW)).last_learned_on is None
    assert await _row(APPLE) is not None


async def test_plt13_r4_resubscribe_still_refuses_unknown_push_services(client):
    body = {
        "install_id": INSTALL,
        "subscription": {"endpoint": "https://10.0.0.1/x", "keys": {"p256dh": "k", "auth": "a"}},
        "old_endpoint": APPLE,
    }
    assert (await client.post("/api/push/resubscribe", json=body)).status_code == 422


# R5 -----------------------------------------------------------------------


async def test_plt13_r5_try_sends_one_neutral_notification_to_this_device_only(client, webpush_calls):
    await _subscribe(client)
    await _subscribe(client, endpoint=APPLE_NEW, install="other-device-1")
    for ep in (APPLE, APPLE_NEW):
        await client.put("/api/push/replies", json={"endpoint": ep, "enabled": True})
    r = await client.post("/api/push/test", json={"endpoint": APPLE})
    assert r.json() == {"sent": True}
    assert [c["subscription_info"]["endpoint"] for c in webpush_calls.calls] == [APPLE]
    payload = json.loads(webpush_calls.calls[0]["data"])
    assert payload["title"] and payload["body"] and not RELIGIOUS.search(payload["title"] + payload["body"])
    assert payload["url"].startswith(push.APP_BASE + "/")  # opens Rafeeq (R6)


async def test_plt13_r5_a_fourth_try_today_is_refused_and_nothing_is_sent(client, webpush_calls):
    await _subscribe(client)
    await client.put("/api/push/replies", json={"endpoint": APPLE, "enabled": True})
    for _ in range(push.TEST_PER_DAY):
        assert (await client.post("/api/push/test", json={"endpoint": APPLE})).status_code == 200
    r = await client.post("/api/push/test", json={"endpoint": APPLE})
    assert r.status_code == 429
    assert len(webpush_calls.calls) == 3


async def test_plt13_r5_no_try_before_a_type_is_on(client, webpush_calls):
    await _subscribe(client)
    assert (await client.post("/api/push/test", json={"endpoint": APPLE})).status_code == 404
    assert (await client.post("/api/push/test", json={"endpoint": "https://web.push.apple.com/unknown"})).status_code == 404
    assert webpush_calls.calls == []


def test_plt13_r5_test_text_is_neutral():
    for title, body in push.TEST_TEXT.values():
        assert title and body and not RELIGIOUS.search(title + body)


# R6 -----------------------------------------------------------------------


async def test_plt13_r6_every_server_link_opens_inside_the_app(webpush_calls):
    for url in ("/next", "/mentor", "/mentor/group", "/"):
        await push.send(_sub(), {"title": "t", "url": url, "tag": "reminder"})
    urls = [json.loads(c["data"])["url"] for c in webpush_calls.calls]
    assert all(u.startswith(push.APP_BASE + "/") for u in urls), urls
