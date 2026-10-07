"""Security review 2026-10-07, A-H5: anonymous events are counted per event,
the outbox lookups have indexes, and old rows nobody reads are removed."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, text

from app.core import retention
from app.core.db import SessionLocal
from app.core.events import OutboxEvent, payload_text
from app.motivation import jobs as mot_jobs
from app.motivation.models import AnonEvent
from app.motivation.router import EVENTS_PER_MIN_ADDRESS, EVENTS_PER_MIN_DEVICE, EVENTS_PER_REQUEST, published_account_statuses
from tests.conftest import auth, with_roles


def batch(install: str, n: int) -> dict:
    return {"install_id": install, "events": [{"type": "first_answer", "objective_id": "o1", "context": "lesson", "correct": True}] * n}


async def rows() -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(func.count()).select_from(AnonEvent)) or 0


async def test_h5_one_request_carries_at_most_100_events(client):
    assert EVENTS_PER_REQUEST == 100
    assert (await client.post("/api/events", json=batch("device-0001", 101))).status_code == 422
    assert (await client.post("/api/events", json=batch("device-0001", 100))).status_code == 202
    assert await rows() == 100


async def test_h5_events_not_requests_count_against_the_device_limit(client):
    for _ in range(EVENTS_PER_MIN_DEVICE // 100):
        assert (await client.post("/api/events", json=batch("device-0001", 100))).status_code == 202
    assert (await client.post("/api/events", json=batch("device-0001", 100))).status_code == 429
    assert await rows() == EVENTS_PER_MIN_DEVICE  # the refused batch stored nothing


async def test_h5_one_address_cannot_multiply_its_limit_with_new_device_ids(client):
    sent = 0
    for i in range(EVENTS_PER_MIN_ADDRESS // 100):
        assert (await client.post("/api/events", json=batch(f"device-{i:04d}", 100))).status_code == 202
        sent += 100
    assert (await client.post("/api/events", json=batch("device-9999", 100))).status_code == 429
    assert await rows() == sent == EVENTS_PER_MIN_ADDRESS


async def test_h5_opt_out_still_goes_through_when_the_event_budget_is_spent(client):
    for _ in range(EVENTS_PER_MIN_DEVICE // 100):
        await client.post("/api/events", json=batch("device-0001", 100))
    assert (await client.post("/api/events", json=batch("device-0001", 1))).status_code == 429
    r = await client.post("/api/events", json={"install_id": "device-0001", "events": [{"type": "opt_out"}]})
    assert r.status_code == 202
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(AnonEvent).where(AnonEvent.install_id == "device-0001")) == 0


async def test_h5_outbox_lookups_by_device_and_account_use_an_index():
    async with SessionLocal() as s:
        names = set(await s.scalars(text("SELECT indexname FROM pg_indexes WHERE tablename = 'outbox'")))
        assert {"ix_outbox_payload_install_id", "ix_outbox_payload_user_id", "ix_outbox_payload_mentor_id"} <= names
        await s.execute(text("SET LOCAL enable_seqscan = off"))
        for key, index in (
            ("install_id", "ix_outbox_payload_install_id"),
            ("user_id", "ix_outbox_payload_user_id"),
            ("mentor_id", "ix_outbox_payload_mentor_id"),
        ):
            stmt = delete(OutboxEvent).where(payload_text(key) == "x")
            sql = str(stmt.compile(s.bind, compile_kwargs={"literal_binds": True}))
            plan = "\n".join(await s.scalars(text("EXPLAIN " + sql)))
            assert index in plan, plan


async def test_h5_old_anonymous_events_go_and_the_indicator_window_stays(client):
    """MOT-08 R3 reads 7 and 30 days: events inside the window are untouched."""
    today = datetime.now(UTC).astimezone(mot_jobs.RIYADH).date()
    async with SessionLocal() as s:
        for age in (0, 30, mot_jobs.ANON_EVENT_DAYS, mot_jobs.ANON_EVENT_DAYS + 1, 400):
            s.add_all(
                AnonEvent(install_id=f"d{i}", type="lesson_completed", lesson_id="u01-l1", day=today - timedelta(days=age))
                for i in range(12)
            )
        await s.commit()
    team = await with_roles(client, "team-1", "team")
    before = (await client.get("/api/team/indicators?days=30", headers=auth(team))).json()["learning"]
    async with SessionLocal() as s:
        assert await mot_jobs.purge_old_anon_events(s) == 24
        ages = sorted({(today - d).days for d in await s.scalars(select(AnonEvent.day))})
    assert ages == [0, 30, mot_jobs.ANON_EVENT_DAYS]
    after = (await client.get("/api/team/indicators?days=30", headers=auth(team))).json()["learning"]
    assert after == before and sum(d["count"] for d in after["lessons_per_day"]) == 24


async def test_h5_old_outbox_rows_go_but_every_reader_keeps_what_it_reads():
    now = datetime.now(UTC)
    old = now - timedelta(days=retention.OUTBOX_DAYS + 5)
    older = old - timedelta(days=30)

    def status(subject: dict, value: str, at: datetime) -> OutboxEvent:
        return OutboxEvent(name="EngagementStatusChanged", source="MOT", payload={**subject, "status": value}, created_at=at)

    async with SessionLocal() as s:
        s.add_all(
            [
                # account A: two old statuses; the latest one is what the mentor's copy shows
                status({"user_id": "acc-a"}, "active", older),
                status({"user_id": "acc-a"}, "at_risk", old),
                # account B: an old status and a recent one
                status({"user_id": "acc-b"}, "new", old),
                status({"user_id": "acc-b"}, "active", now),
                # device statuses and other events: history only
                status({"install_id": "dev-1"}, "new", old),
                status({"install_id": "dev-2"}, "new", now),
                OutboxEvent(name="MentorContacted", source="CMP", payload={"user_id": "acc-a"}, created_at=old),
                OutboxEvent(name="MentorContacted", source="CMP", payload={"user_id": "acc-a"}, created_at=now - timedelta(days=30)),
                OutboxEvent(name="BadgeEarned", source="MOT", payload={"user_id": "acc-a", "badge_id": "days-7"}, created_at=old),
            ]
        )
        await s.commit()
        assert await retention.purge_old_events(s, now) == 5
        left = sorted(
            (e.name, e.payload.get("user_id") or e.payload.get("install_id"), e.payload.get("status"))
            for e in await s.scalars(select(OutboxEvent))
        )
        assert left == [
            ("EngagementStatusChanged", "acc-a", "at_risk"),
            ("EngagementStatusChanged", "acc-b", "active"),
            ("EngagementStatusChanged", "dev-2", "new"),
            ("MentorContacted", "acc-a", None),
        ]
        assert await published_account_statuses(s) == {"acc-a": "at_risk", "acc-b": "active"}
        assert await retention.purge_old_events(s, now) == 0


def test_h5_the_retention_jobs_are_registered():
    from app import jobs

    jobs._register()
    ids = {j.id for j in jobs.scheduler.get_jobs()}
    assert {"outbox-retention", "mot-anon-retention", "mot-daily"} <= ids
