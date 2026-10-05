"""MOT-07 engagement status and MOT-08 R2 snapshots: one test per example."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.db import SessionLocal
from app.motivation.engagement import after_interaction, status_at
from app.motivation.jobs import refresh_and_snapshot
from app.motivation.models import AnonEvent, DailySnapshot, EngagementState
from tests.conftest import auth, register

NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)


def ago(days: float) -> datetime:
    return NOW - timedelta(days=days)


def test_mot07_r1_opening_the_app_does_not_count():
    # Opening the app sends no learning event; last lesson 8 days ago.
    assert status_at(NOW, ago(60), ago(8), None) == "at_risk"


def test_mot07_r1_worship_tracking_does_not_count():
    # Prayer logs stay on the device and never reach this function.
    assert status_at(NOW, ago(90), ago(30), None) == "lapsed"


def test_mot07_r2_new_learner():
    assert status_at(NOW, ago(3), ago(3), None) == "new"


def test_mot07_r2_lapsed_learner_who_comes_back_is_returning():
    first, last, returned = after_interaction(ago(2), ago(90), ago(40), None)
    assert returned == ago(2)
    assert status_at(NOW, first, last, returned) == "returning"


def test_mot07_r2_returning_becomes_active_after_seven_days():
    assert status_at(NOW, ago(90), ago(1), ago(7)) == "active"


def test_mot07_r2_no_lesson_no_status():
    assert status_at(NOW, None, None, None) is None


def test_mot07_r3_eighth_day_without_a_lesson():
    assert status_at(NOW - timedelta(hours=1), ago(60), ago(8), None) == "active"
    assert status_at(NOW, ago(60), ago(8), None) == "at_risk"


def test_late_offline_events_never_move_last_backwards():
    assert after_interaction(ago(5), ago(20), ago(1), None) == (ago(20), ago(1), None)


async def test_mot07_r3_status_refreshes_daily_and_emits_change(client):
    async with SessionLocal() as s:
        s.add(EngagementState(install_id="dev-aaaaaaaa", status="active", first_at=ago(60), last_at=ago(8)))
        await s.commit()
        await refresh_and_snapshot(s, NOW)
        st = await s.get(EngagementState, "dev-aaaaaaaa")
        assert st.status == "at_risk"
        from app.core.events import OutboxEvent

        assert [e.name for e in await s.scalars(select(OutboxEvent))] == ["EngagementStatusChanged"]


async def test_mot07_r4_guest_lesson_reaches_rafeeq_and_gets_a_status(client):
    r = await client.post(
        "/api/events", json={"install_id": "guest-joseph-1", "events": [{"type": "lesson_completed", "lesson_id": "u1-l1"}]}
    )
    assert r.status_code == 202
    async with SessionLocal() as s:
        st = await s.get(EngagementState, "guest-joseph-1")
        assert st.status == "new"


async def test_mot07_r4_guest_status_moves_to_the_new_account(client):
    await client.post("/api/events", json={"install_id": "guest-joseph-1", "events": [{"type": "lesson_completed", "lesson_id": "u1-l1"}]})
    token = (await register(client))["access_token"]
    assert (await client.post("/api/me/install", json={"install_id": "guest-joseph-1"}, headers=auth(token))).status_code == 204
    async with SessionLocal() as s:
        st = await s.get(EngagementState, "guest-joseph-1")
        assert st.user_id is not None and st.status == "new"
        snap = await refresh_and_snapshot(s)
        assert sum(snap.counts.values()) == 1


async def test_mot07_r4_opt_out_unlinks_events_and_keeps_counts(client):
    events = [{"type": "lesson_completed", "lesson_id": f"u1-l{i}"} for i in range(1, 4)]
    await client.post("/api/events", json={"install_id": "daniel-device", "events": events})
    await client.post("/api/events", json={"install_id": "daniel-device", "events": [{"type": "opt_out"}]})
    async with SessionLocal() as s:
        rows = list(await s.scalars(select(AnonEvent)))
        assert all(r.install_id is None for r in rows)
        assert sum(r.type == "lesson_completed" for r in rows) == 3 and sum(r.type == "opt_out" for r in rows) == 1
        assert await s.get(EngagementState, "daniel-device") is None


async def test_mot08_r2_snapshot_is_never_recomputed(client):
    async with SessionLocal() as s:
        s.add(EngagementState(install_id="dev-bbbbbbbb", status="active", first_at=ago(60), last_at=ago(1)))
        await s.commit()
        first = await refresh_and_snapshot(s, NOW)
        assert first.counts["active"] == 1
        await s.delete(await s.get(EngagementState, "dev-bbbbbbbb"))
        await s.commit()
        assert await refresh_and_snapshot(s, NOW) is None
        assert (await s.get(DailySnapshot, first.day)).counts["active"] == 1
