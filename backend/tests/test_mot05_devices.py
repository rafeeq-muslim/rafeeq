"""MOT-05 R2 across an account's devices (audit gap). R5 (/next opens one
step) is resolved on the device: frontend/src/app/motivation/motivation.test.tsx."""

from datetime import UTC, datetime

from sqlalchemy import select

from app.core.db import SessionLocal
from app.platform.models import PushSubscription
from app.platform.push import due
from tests.conftest import auth, register

PHONE = "https://fcm.googleapis.com/fcm/send/phone"
LAPTOP = "https://fcm.googleapis.com/fcm/send/laptop"


async def subscribe(client, endpoint: str, token: str | None = None) -> None:
    body = {
        "install_id": "dev-12345678",
        "subscription": {"endpoint": endpoint, "keys": {"p256dh": "k", "auth": "a"}},
        "timezone": "Asia/Riyadh",
    }
    r = await client.post("/api/push/subscribe", json=body, headers=auth(token) if token else {})
    assert r.status_code == 204, r.text
    r = await client.put("/api/push/reminder", json={"endpoint": endpoint, "enabled": True, "time": "21:00"})
    assert r.status_code == 200, r.text


async def subs() -> dict[str, PushSubscription]:
    async with SessionLocal() as s:
        return {x.endpoint: x for x in await s.scalars(select(PushSubscription))}


async def test_mot05_r2_learning_on_one_device_stops_the_reminder_on_the_others(client):
    token = (await register(client))["access_token"]
    await subscribe(client, PHONE, token)
    await subscribe(client, LAPTOP, token)
    # Joseph learns at 6 pm on a device with no push of its own.
    r = await client.post("/api/push/learned", json={"day": "2026-10-10"}, headers=auth(token))
    assert r.status_code == 204
    at_nine = datetime(2026, 10, 10, 18, tzinfo=UTC)  # 21:00 in Riyadh
    for sub in (await subs()).values():
        assert sub.last_learned_on == "2026-10-10"
        assert due(sub, at_nine)[0] is False


async def test_mot05_r2_a_guest_device_marks_only_itself(client):
    await subscribe(client, PHONE)
    await subscribe(client, LAPTOP)
    assert (await client.post("/api/push/learned", json={"endpoint": PHONE, "day": "2026-10-10"})).status_code == 204
    s = await subs()
    assert s[PHONE].last_learned_on == "2026-10-10" and s[LAPTOP].last_learned_on is None


async def test_mot05_r2_nothing_to_mark_without_device_or_account(client):
    assert (await client.post("/api/push/learned", json={"day": "2026-10-10"})).status_code == 204
