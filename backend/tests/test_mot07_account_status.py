"""MOT-07 R2/R6 (mot-07-r6-account-status): an account has ONE engagement
status across its devices that share events, and only that status reaches
the mentor's copy (CMP-02 R6). Device events stay for Organisations."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.companion.models import MenteeStatus
from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.motivation.engagement import account_status, account_timeline
from app.motivation.jobs import refresh_and_snapshot
from app.motivation.models import EngagementState
from tests.conftest import auth, register

NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)
LESSON = {"type": "lesson_completed", "lesson_id": "u01-l1"}


def ago(days: float, now: datetime = NOW) -> datetime:
    return now - timedelta(days=days)


# --- the account timeline (pure) ---------------------------------------------


def test_mot07_r6_an_idle_old_device_does_not_hide_the_active_one():
    assert account_status(NOW, [(ago(90), ago(20), None), (ago(30), ago(1), None)]) == "active"


def test_mot07_r2_a_new_second_device_does_not_make_the_account_new():
    first, last, returned = account_timeline([(ago(60), ago(2), None), (ago(0), ago(0), None)])
    assert first == ago(60) and last == ago(0) and returned is None
    assert account_status(NOW, [(ago(60), ago(2), None), (ago(0), ago(0), None)]) == "active"


def test_mot07_r2_a_device_return_is_not_an_account_return_while_another_device_was_used():
    # The phone was lapsed and comes back today; the laptop was used yesterday.
    assert account_status(NOW, [(ago(90), ago(0), ago(0)), (ago(50), ago(1), None)]) == "active"


def test_mot07_r2_a_lapsed_account_that_comes_back_on_a_new_device_is_returning():
    assert account_status(NOW, [(ago(90), ago(40), None), (ago(2), ago(2), None)]) == "returning"


def test_mot07_r2_one_device_alone_keeps_its_own_status():
    assert account_status(NOW, [(ago(90), ago(2), ago(2))]) == "returning"
    assert account_status(NOW, []) is None


# --- what the mentor's copy gets -----------------------------------------------


async def account(client, username="joseph-1") -> tuple[str, uuid.UUID]:
    data = await register(client, username=username)
    return data["access_token"], uuid.UUID(data["user"]["id"])


async def mentor_copy(user_id: uuid.UUID) -> str | None:
    async with SessionLocal() as s:
        row = await s.get(MenteeStatus, user_id)
        return row.status if row else None


async def sent(where) -> list[dict]:
    async with SessionLocal() as s:
        q = select(OutboxEvent).where(OutboxEvent.name == "EngagementStatusChanged").order_by(OutboxEvent.created_at)
        return [e.payload for e in await s.scalars(q) if where(e.payload)]


async def test_mot07_r6_two_devices_one_idle_the_mentor_sees_active(client):
    _, uid = await account(client)
    async with SessionLocal() as s:
        s.add(EngagementState(install_id="old-tablet", user_id=uid, status="active", first_at=ago(90), last_at=ago(8)))
        s.add(EngagementState(install_id="new-phone1", user_id=uid, status="active", first_at=ago(60), last_at=ago(1)))
        await s.commit()
        snap = await refresh_and_snapshot(s, NOW)
        assert (await s.get(EngagementState, "old-tablet")).status == "at_risk"
    assert await mentor_copy(uid) == "active"
    # The idle device's own change still goes out for Organisations, without the account.
    assert {"install_id": "old-tablet", "status": "at_risk"} in await sent(lambda p: "install_id" in p)
    assert [p["status"] for p in await sent(lambda p: "user_id" in p)] == ["active"]
    assert snap.transitions == {f"u:{uid}": "active"} and snap.counts["active"] == 1


async def test_mot07_r6_one_device_opts_out_the_mentor_still_sees_the_other(client):
    token, uid = await account(client)
    for device in ("phone-joseph", "laptop-joseph"):
        await client.post("/api/events", json={"install_id": device, "events": [LESSON]})
        assert (await client.post("/api/me/install", json={"install_id": device}, headers=auth(token))).status_code == 204
    assert await mentor_copy(uid) == "new"
    await client.post("/api/events", json={"install_id": "phone-joseph", "events": [{"type": "opt_out"}]})
    assert await mentor_copy(uid) == "new"
    async with SessionLocal() as s:
        assert [r.install_id for r in await s.scalars(select(EngagementState).where(EngagementState.user_id == uid))] == ["laptop-joseph"]


async def test_mot07_r6_all_devices_opt_out_the_account_has_no_status(client):
    token, uid = await account(client)
    for device in ("phone-joseph", "laptop-joseph"):
        await client.post("/api/events", json={"install_id": device, "events": [LESSON]})
        await client.post("/api/me/install", json={"install_id": device}, headers=auth(token))
    for device in ("phone-joseph", "laptop-joseph"):
        await client.post("/api/events", json={"install_id": device, "events": [{"type": "opt_out"}]})
    assert await mentor_copy(uid) is None
    assert (await sent(lambda p: "user_id" in p))[-1] == {"user_id": str(uid), "status": None}


async def test_mot07_r2_a_second_device_that_signs_in_first_does_not_make_the_account_new(client):
    token, uid = await account(client)
    now = datetime.now(UTC)
    async with SessionLocal() as s:
        s.add(EngagementState(install_id="first-phone", user_id=uid, status="active", first_at=ago(60, now), last_at=ago(2, now)))
        await s.commit()
    # A fresh install signs in before its first lesson, then learns.
    assert (await client.post("/api/me/install", json={"install_id": "second-phone"}, headers=auth(token))).status_code == 204
    await client.post("/api/events", json={"install_id": "second-phone", "events": [LESSON]})
    async with SessionLocal() as s:
        assert (await s.get(EngagementState, "second-phone")).status == "new"  # the device's own, for ORG only
    assert await mentor_copy(uid) == "active"
    assert "new" not in [p["status"] for p in await sent(lambda p: "user_id" in p)]


async def test_mot07_r6_the_account_status_is_sent_only_when_it_changes(client):
    token, uid = await account(client)
    await client.post("/api/events", json={"install_id": "phone-joseph", "events": [LESSON]})
    await client.post("/api/me/install", json={"install_id": "phone-joseph"}, headers=auth(token))
    await client.post("/api/events", json={"install_id": "phone-joseph", "events": [LESSON]})
    await client.post("/api/events", json={"install_id": "laptop-joseph", "events": [LESSON]})
    await client.post("/api/me/install", json={"install_id": "laptop-joseph"}, headers=auth(token))
    assert await sent(lambda p: "user_id" in p) == [{"user_id": str(uid), "status": "new"}]
    # Device events never name the account.
    assert all("user_id" not in p for p in await sent(lambda p: "install_id" in p))
