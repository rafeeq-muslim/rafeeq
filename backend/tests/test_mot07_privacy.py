"""MOT-07 R4 audit gaps: opting out and deleting the account leave no device
or account id in the snapshot history; a guest who attaches an account
publishes the status so the mentor's copy fills."""

import uuid
from datetime import date

from sqlalchemy import select

from app.companion.models import MenteeStatus
from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.motivation.models import AnonEvent, DailySnapshot, EngagementState
from tests.conftest import auth, register

LESSON = {"type": "lesson_completed", "lesson_id": "u01-l1"}


async def add_snapshot(transitions: dict[str, str]) -> None:
    async with SessionLocal() as s:
        counts: dict[str, int] = {}
        for v in transitions.values():
            counts[v] = counts.get(v, 0) + 1
        s.add(DailySnapshot(day=date(2026, 9, 30), counts=counts, transitions=transitions))
        await s.commit()


async def snapshot() -> DailySnapshot:
    async with SessionLocal() as s:
        return await s.get(DailySnapshot, date(2026, 9, 30))


async def test_mot07_r4_opt_out_removes_the_device_from_snapshot_history(client):
    await client.post("/api/events", json={"install_id": "daniel-device", "events": [LESSON]})
    await add_snapshot({"i:daniel-device": "active", "i:someone-else": "active"})
    await client.post("/api/events", json={"install_id": "daniel-device", "events": [{"type": "opt_out"}]})
    snap = await snapshot()
    assert snap.transitions == {"i:someone-else": "active"}
    assert snap.counts == {"active": 2}  # MOT-08 R2: the frozen counts stay


async def test_mot07_r4_account_deletion_unlinks_history_like_an_opt_out(client):
    await client.post("/api/events", json={"install_id": "joseph-device", "events": [LESSON]})
    data = await register(client)
    token, uid = data["access_token"], data["user"]["id"]
    assert (await client.post("/api/me/install", json={"install_id": "joseph-device"}, headers=auth(token))).status_code == 204
    await add_snapshot({f"u:{uid}": "new", "i:joseph-device": "new", "i:someone-else": "active"})
    assert (await client.delete("/api/me", headers=auth(token))).status_code == 204
    snap = await snapshot()
    assert snap.transitions == {"i:someone-else": "active"} and snap.counts == {"new": 2, "active": 1}
    async with SessionLocal() as s:
        assert await s.get(EngagementState, "joseph-device") is None
        rows = list(await s.scalars(select(AnonEvent)))
        assert rows and all(r.install_id is None for r in rows)  # counted, linked to nothing
        assert not [e for e in await s.scalars(select(OutboxEvent)) if "joseph-device" in str(e.payload) or uid in str(e.payload)]


async def test_mot07_r4_guest_who_signs_up_fills_the_mentor_copy(client):
    await client.post("/api/events", json={"install_id": "guest-joseph-1", "events": [LESSON]})
    data = await register(client)
    token, uid = data["access_token"], data["user"]["id"]
    await client.post("/api/me/install", json={"install_id": "guest-joseph-1"}, headers=auth(token))
    async with SessionLocal() as s:
        sent = [e.payload for e in await s.scalars(select(OutboxEvent).where(OutboxEvent.name == "EngagementStatusChanged"))]
        assert {"user_id": uid, "status": "new"} in sent  # the account's one status (MOT-07 R6), no device id
        row = await s.get(MenteeStatus, uuid.UUID(uid))
        assert row is not None and row.status == "new"  # shown to the mentor only while shared (CMP-02 R6)
