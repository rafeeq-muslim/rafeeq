"""Security review 2026-10-07, follow-up: the team's indicators (MOT-08,
MOT-09) read the period's anonymous events a chunk at a time and keep running
totals only, with the same figures as before, and the route has its own limit
per team member."""

import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import event, select

from app.core.db import SessionLocal, engine
from app.learning.public import path_order
from app.motivation import indicators
from app.motivation.models import AnonEvent
from app.motivation.router import RIYADH
from tests.conftest import auth, with_roles

TYPES = (
    ["first_answer"] * 8
    + ["lesson_completed"] * 3
    + ["why_shown"] * 2
    + ["mastered", "unit_completed", "guide_shown", "guide_followed", "placement_done", "placement_skipped", "opt_out", "hint_opened"]
)


def synthetic_events(n: int, seed: int = 7, devices: int = 40) -> list[AnonEvent]:
    """Events of every kind the indicators read, from linked devices and from
    devices that opted out, some with the device's own counter and some without."""
    rnd = random.Random(seed)
    order = path_order()
    lessons = [lsn["lesson_id"] for u in order for lsn in u["lessons"]][:12] + ["zz-l9"]
    units = [u["unit_id"] for u in order][:4] + ["zz"]
    objectives = [o for u in order for lsn in u["lessons"] for o in lsn["objectives"]][:10] + ["zz-o9"]
    today = datetime.now(UTC).astimezone(RIYADH).date()
    out = []
    for i in range(n):
        type_ = rnd.choice(TYPES)
        out.append(
            AnonEvent(
                install_id=None if type_ == "opt_out" or rnd.random() < 0.1 else f"device-{rnd.randrange(devices):04d}",
                type=type_,
                lesson_id=rnd.choice(lessons) if type_ == "lesson_completed" else None,
                unit_id=rnd.choice(units) if type_ == "unit_completed" else None,
                objective_id=rnd.choice(objectives) if type_ in ("first_answer", "why_shown", "mastered") else None,
                correct=rnd.choice([True, True, False, None]) if type_ == "first_answer" else None,
                context=rnd.choice(["lesson", "lesson", "review", "review", "quick_check", "placement"])
                if type_ == "first_answer"
                else None,
                shown=rnd.choice(["ai_explanation", "ai_explanation", "card_holdout", "card_only"]) if type_ == "why_shown" else None,
                is_repeat=rnd.choice([None, False, True]) if type_ in ("lesson_completed", "unit_completed") else None,
                value=rnd.randrange(4) if type_ == "placement_done" else None,
                day=today - timedelta(days=rnd.randrange(7)),
                seq=i if rnd.random() < 0.7 else None,
            )
        )
    return out


async def seed(n: int) -> None:
    async with SessionLocal() as s:
        s.add_all(synthetic_events(n))
        await s.commit()


async def stored() -> list[AnonEvent]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(AnonEvent).order_by(AnonEvent.id)))


async def test_the_events_are_read_in_chunks_and_never_held_together(client, monkeypatch):
    await seed(3000)
    team = auth(await with_roles(client, "team-1", "team"))
    monkeypatch.setattr(indicators, "CHUNK", 200)
    loaded, reads = [], []

    def on_load(target, context):
        loaded.append(target)

    def on_execute(conn, cursor, statement, parameters, context, executemany):
        if "mot_anon_events" in statement:
            reads.append((context.execution_options.get("stream_results"), context.execution_options.get("yield_per")))

    event.listen(AnonEvent, "load", on_load)
    event.listen(engine.sync_engine, "before_cursor_execute", on_execute)
    try:
        r = await client.get("/api/team/indicators?days=7", headers=team)
    finally:
        event.remove(AnonEvent, "load", on_load)
        event.remove(engine.sync_engine, "before_cursor_execute", on_execute)
    assert r.status_code == 200, r.text
    assert loaded == []  # no event object is built, let alone 3000 of them
    assert reads == [(True, 200)]  # one read of the events, streamed 200 rows at a time


async def test_the_figures_are_the_same_read_in_chunks_or_all_at_once(client, monkeypatch):
    await seed(4000)
    team = auth(await with_roles(client, "team-1", "team"))
    monkeypatch.setattr(indicators, "CHUNK", 137)  # devices and objectives are cut across chunks
    body = (await client.get("/api/team/indicators?days=7", headers=team)).json()

    whole = indicators.figures_of(await stored(), path_order())
    assert body["understanding"] == whole.understanding()
    assert {k: body["learning"][k] for k in ("per_lesson", "units_completed")} == whole.learning()
    assert body["learning"]["opted_out"] == whole.opted_out > 0
    assert {d["day"]: d["count"] for d in body["learning"]["lessons_per_day"] if d["count"]} == {
        d.isoformat(): n for d, n in whole.by_day.items()
    }
    # The synthetic set is large enough to show numbers, not only «not enough data».
    shown = body["understanding"]
    assert any(v["lesson"] is not None and v["review"] is not None for v in shown["objectives"].values())
    assert shown["why_experiment"]["difference"] is not None and shown["placement"]["skipped"] is not None
    assert shown["guide_followed"] is not None and shown["quick_check_correct"] is not None and shown["weakest"]


async def test_the_route_has_a_limit_per_team_member(client):
    team = auth(await with_roles(client, "team-1", "team"))
    other = auth(await with_roles(client, "team-2", "team"))
    for _ in range(indicators.READS_PER_MIN):
        assert (await client.get("/api/team/indicators", headers=team)).status_code == 200
    assert (await client.get("/api/team/indicators", headers=team)).status_code == 429
    assert (await client.get("/api/team/indicators", headers=other)).status_code == 200
