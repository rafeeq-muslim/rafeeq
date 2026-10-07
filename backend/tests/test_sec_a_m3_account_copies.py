"""Security review 2026-10-07, A-M3: the account copies (saved items, learning
progress, learning log, badges) have a ceiling per account, are merged without
one query per item, and writes are limited per account."""

from sqlalchemy import event, func, select

from app.core.db import SessionLocal, engine
from app.knowledge.discover import SAVED_MAX, SAVED_WRITES_PER_MIN
from app.knowledge.models import SavedItem
from app.learning.models import LessonCompletion, ObjectiveMastery, UnitUnlock
from app.learning.router import LEARNING_WRITES_PER_MIN
from app.motivation.challenges import LOG_MAX, LOG_WRITES_PER_MIN
from app.motivation.models import EarnedBadge, LearningLog
from app.motivation.router import MOTIVATION_WRITES_PER_MIN
from tests.cmp_helpers import group_with, person
from tests.conftest import auth, register

T = "2026-10-0{}T08:00:00+00:00"
C = {"first": "2026-10-01T08:00:00Z", "last": "2026-10-01T08:00:00Z", "times": 1}
M = {"p": 0.5, "seen": True, "answered": True, "lastAnswerAt": "2026-10-03T08:00:00Z", "checksDone": 0}


class Statements:
    """Counts the SQL statements sent while it is open."""

    def __enter__(self):
        self.n = 0
        event.listen(engine.sync_engine, "before_cursor_execute", self._count)
        return self

    def __exit__(self, *exc):
        event.remove(engine.sync_engine, "before_cursor_execute", self._count)

    def _count(self, *args):
        self.n += 1


async def count(model, *where) -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(func.count()).select_from(model).where(*where)) or 0


def cards(start: int, n: int, day: int = 1) -> dict:
    return {"items": [{"kind": "card", "ref": f"c{i}", "saved_at": T.format(day)} for i in range(start, start + n)]}


# --- saved items (KNW-09) -----------------------------------------------------


async def test_m3_an_account_keeps_at_most_500_saved_items(client):
    h = auth((await register(client))["access_token"])
    assert (await client.put("/api/me/saved", json=cards(0, 400), headers=h)).status_code == 200
    r = await client.put("/api/me/saved", json=cards(400, 300, day=2), headers=h)
    assert r.status_code == 200 and len(r.json()["items"]) == SAVED_MAX == 500
    assert await count(SavedItem) == 500
    # what was already in the account stays; a third device adds nothing more
    kept = {i["ref"] for i in r.json()["items"]}
    assert {f"c{i}" for i in range(400)} <= kept
    assert len((await client.put("/api/me/saved", json=cards(900, 50, day=3), headers=h)).json()["items"]) == 500
    # room comes back when the learner deletes one (R5)
    assert (await client.delete("/api/me/saved/card/c0", headers=h)).status_code == 204
    again = (await client.put("/api/me/saved", json=cards(900, 50, day=3), headers=h)).json()["items"]
    assert len(again) == 500 and sum(900 <= int(i["ref"][1:]) < 950 for i in again) == 1


async def test_m3_saved_export_is_bounded(client):
    h = auth((await register(client))["access_token"])
    await client.put("/api/me/saved", json=cards(0, 700), headers=h)
    assert len((await client.get("/api/me/export", headers=h)).json()["knowledge"]["saved"]) == 500


async def test_m3_saved_writes_are_limited_per_account(client):
    h = auth((await register(client))["access_token"])
    other = auth((await register(client, username="yusuf-2"))["access_token"])
    for _ in range(SAVED_WRITES_PER_MIN):
        assert (await client.put("/api/me/saved", json=cards(0, 1), headers=h)).status_code == 200
    assert (await client.put("/api/me/saved", json=cards(0, 1), headers=h)).status_code == 429
    assert (await client.put("/api/me/saved", json=cards(0, 1), headers=other)).status_code == 200


# --- learning progress (LRN-02, LRN-10) -----------------------------------------


async def test_m3_progress_keeps_only_ids_of_the_path(client):
    h = auth((await register(client))["access_token"])
    body = {
        "completed": {"u01-l1": C, **{f"zz-{i}": C for i in range(400)}},
        "unlockedUnits": ["u2", *(f"x{i}" for i in range(40))],
        "mastery": {"u01-l1-o1": M, **{f"junk-objective-{i}": M for i in range(1500)}},
    }
    with Statements() as sql:
        r = await client.put("/api/me/learning", json=body, headers=h)
    assert r.status_code == 200 and sql.n < 20, sql.n  # before: one SELECT and one INSERT per unknown id
    assert list(r.json()["completed"]) == ["u01-l1"] and r.json()["unlockedUnits"] == ["u2"] and list(r.json()["mastery"]) == ["u01-l1-o1"]
    assert (await count(LessonCompletion), await count(UnitUnlock), await count(ObjectiveMastery)) == (1, 1, 1)


async def test_m3_a_whole_path_merges_in_a_few_statements(client):
    from app.learning.content import store

    h = auth((await register(client))["access_token"])
    body = {"completed": {lid: C for lid in store().lessons}, "mastery": {o: M for o in store().objective_ids()}}
    assert len(body["mastery"]) > 50
    assert (await client.put("/api/me/learning", json=body, headers=h)).status_code == 200
    later = {**M, "lastAnswerAt": "2026-10-05T08:00:00Z", "p": 0.9}
    body = {"completed": body["completed"], "mastery": {o: later for o in body["mastery"]}}
    with Statements() as sql:
        r = await client.put("/api/me/learning", json=body, headers=h)
    assert r.status_code == 200 and all(m["p"] == 0.9 for m in r.json()["mastery"].values())
    assert sql.n < 20, sql.n


async def test_m3_progress_writes_are_limited_per_account(client):
    h = auth((await register(client))["access_token"])
    for _ in range(LEARNING_WRITES_PER_MIN):
        assert (await client.put("/api/me/learning", json={}, headers=h)).status_code == 200
    assert (await client.put("/api/me/learning", json={}, headers=h)).status_code == 429
    for _ in range(MOTIVATION_WRITES_PER_MIN):
        assert (await client.put("/api/me/motivation", json={}, headers=h)).status_code == 200
    assert (await client.put("/api/me/motivation", json={}, headers=h)).status_code == 429


# --- badges (MOT-03) --------------------------------------------------------------


async def test_m3_only_badges_of_real_units_are_kept(client):
    h = auth((await register(client))["access_token"])
    at = "2026-10-05T09:00:00Z"
    badges = {b: {"id": b, "earnedAt": at} for b in ("unit-u01", "days-7", *(f"unit-fake{i}" for i in range(90)))}
    r = await client.put("/api/me/motivation", json={"badges": badges}, headers=h)
    assert sorted(r.json()["badges"]) == ["days-7", "unit-u01"]
    assert await count(EarnedBadge) == 2


# --- learning log (MOT-06) ----------------------------------------------------------


async def member(client):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m")
    joseph = await person(client, "joseph-1", gender="m")
    await group_with(client, mentor, joseph)
    return joseph


def lessons(n: int, lesson_id: str = "u01-l1") -> dict:
    return {"entries": [{"kind": "lesson", "item_id": lesson_id, "at": f"2026-10-06T{i // 60:02d}:{i % 60:02d}:00Z"} for i in range(n)]}


async def test_m3_the_log_takes_only_lessons_and_units_of_the_path(client):
    joseph = await member(client)
    entries = [
        {"kind": "lesson", "item_id": "u01-l1"},
        {"kind": "lesson", "item_id": "not-a-lesson"},
        {"kind": "unit", "item_id": "u01"},
        {"kind": "unit", "item_id": "u99"},
        {"kind": "day", "item_id": "2026-10-05"},
        {"kind": "day", "item_id": "2026-10-05"},
    ]
    r = await client.post("/api/me/learning-log", json={"entries": entries}, headers=joseph.h)
    assert r.status_code == 200 and r.json() == {"stored": 3}
    again = await client.post("/api/me/learning-log", json={"entries": entries[:1] + entries[4:]}, headers=joseph.h)
    assert again.json()["stored"] == 1  # the day is kept once; a lesson done again now is a new entry


async def test_m3_the_log_is_merged_with_one_read_and_has_a_ceiling(client, monkeypatch):
    from datetime import UTC, datetime

    from app.motivation import challenges

    monkeypatch.setattr(challenges, "_when", lambda at, now: at or datetime.now(UTC))  # keep the test's own times
    joseph = await member(client)
    with Statements() as sql:
        r = await client.post("/api/me/learning-log", json=lessons(500), headers=joseph.h)
    assert r.json() == {"stored": 500} and sql.n < 20, sql.n  # before: one SELECT per entry
    assert (await client.post("/api/me/learning-log", json=lessons(500), headers=joseph.h)).json() == {"stored": 0}  # same entries

    monkeypatch.setattr(challenges, "LOG_MAX", 700)
    assert LOG_MAX == 5000
    r = await client.post("/api/me/learning-log", json=lessons(500, "u01-l2"), headers=joseph.h)
    assert r.json() == {"stored": 200}
    assert await count(LearningLog, LearningLog.user_id == joseph.id) == 700
    assert len((await client.get("/api/me/export", headers=joseph.h)).json()["motivation"]["learning_log"]) == 700


async def test_m3_log_writes_are_limited_per_account(client):
    joseph = await member(client)
    for _ in range(LOG_WRITES_PER_MIN):
        assert (await client.post("/api/me/learning-log", json={"entries": []}, headers=joseph.h)).status_code == 200
    assert (await client.post("/api/me/learning-log", json={"entries": []}, headers=joseph.h)).status_code == 429
