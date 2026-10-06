"""LRN audit gaps (2026-10-06): lessons in preparation in a language stay on
the path (LRN-01 R6, LRN-02 R3), private progress (LRN-02 R6), the reviewer's
explanation samples and blocks (LRN-03 R6), seen exercises in the account
copy (LRN-04 R2), and the unit 3 review exercise on the day-one objectives
(LRN-09 R3). Runs on the repository's content."""

from sqlalchemy import select

from app.core.db import SessionLocal
from app.knowledge.models import ExplanationLog
from app.learning import content
from app.learning.models import ExplanationBlock
from tests.conftest import auth, register, with_roles, withdraw

# --- LRN-01 R6 / LRN-02 R3 --------------------------------------------------------


async def test_lrn01_r6_lesson_withdrawn_in_tagalog_is_in_the_unit_outline_not_its_lessons(client):
    content.store.cache_clear()
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "lesson", "u01-l7", "tl", note="Kailangang ayusin")
    tl = (await client.get("/api/content?lang=tl")).json()
    u1 = next(u for u in tl["units"] if u["id"] == "u01")
    assert "u01-l7" not in tl["lessons"]  # no machine translation, no withdrawn text
    assert "u01-l7" not in u1["lessons"]
    assert u1["outline"] == [f"u01-l{i}" for i in range(1, 8)]  # the client still knows the unit has 7 lessons
    ar = (await client.get("/api/content?lang=ar")).json()
    assert "u01-l7" in ar["lessons"]  # per language (KNW-05 R6)


async def test_lrn02_r3_unit_outline_lists_every_lesson_in_order(client):
    content.store.cache_clear()
    r = (await client.get("/api/content?lang=en")).json()
    for u in r["units"]:
        assert u["lessons"] == [lid for lid in u["outline"] if lid in r["lessons"]]


# --- LRN-02 R6 -----------------------------------------------------------------------


async def test_lrn02_r6_another_user_never_sees_my_progress(client):
    joseph = auth((await register(client, username="joseph-1"))["access_token"])
    other = auth((await register(client, username="other-1"))["access_token"])
    body = {"completed": {"u01-l1": {"first": "2026-10-01T08:00:00Z", "last": "2026-10-01T08:00:00Z", "times": 1}}}
    assert (await client.put("/api/me/learning", json=body, headers=joseph)).status_code == 200
    theirs = (await client.get("/api/me/learning", headers=other)).json()
    assert theirs["completed"] == {} and theirs["mastery"] == {}
    assert (await client.get("/api/me/learning")).status_code == 401


# --- LRN-03 R6: reviewer reads samples and blocks one exercise ---------------------


async def _log(exercise_id: str, lang: str, text: str) -> None:
    async with SessionLocal() as s:
        s.add(ExplanationLog(exercise_id=exercise_id, lang=lang, text=text))
        await s.commit()


async def test_lrn03_r6_reviewer_reads_explanation_samples_without_identity(client):
    content.store.cache_clear()
    await _log("u01-l3-e1", "en", "The intention is in the heart.")
    await _log("u01-l3-e2", "tl", "Sa puso ang intensyon.")
    reviewer = auth(await with_roles(client, "mohannad-1", "sharia_reviewer"))
    r = await client.get("/api/learning/explanations?lang=en", headers=reviewer)
    assert r.status_code == 200
    items = r.json()["items"]
    assert [i["exercise_id"] for i in items] == ["u01-l3-e1"]
    assert items[0]["lesson_id"] == "u01-l3" and items[0]["prompt"] and items[0]["blocked"] is False
    assert set(items[0]) == {"id", "at", "exercise_id", "lang", "text", "blocked", "lesson_id", "lesson_title", "prompt"}


async def test_lrn03_r6_reviewer_blocks_and_unblocks_one_exercise(client):
    content.store.cache_clear()
    me = await with_roles(client, "mohannad-1", "sharia_reviewer")
    h = auth(me)
    assert (await client.put("/api/learning/explanations/blocks/u01-l3-e1/en", headers=h)).json() == {"blocked": True}
    assert (await client.put("/api/learning/explanations/blocks/u01-l3-e1/en", headers=h)).status_code == 200  # idempotent
    async with SessionLocal() as s:
        rows = list(await s.scalars(select(ExplanationBlock)))
    assert [(b.exercise_id, b.lang) for b in rows] == [("u01-l3-e1", "en")] and rows[0].blocked_by is not None
    # the block applies to that language only, and the explanation is then the card text alone
    r = await client.post("/api/learning/explain", json={"lesson_id": "u01-l3", "exercise_id": "u01-l3-e1", "lang": "en", "answer": None})
    assert r.json() == {"text": None}
    listed = (await client.get("/api/learning/explanations", headers=h)).json()["blocks"]
    assert listed[0]["exercise_id"] == "u01-l3-e1" and listed[0]["lesson_id"] == "u01-l3"
    assert (await client.delete("/api/learning/explanations/blocks/u01-l3-e1/en", headers=h)).json() == {"blocked": False}
    async with SessionLocal() as s:
        assert list(await s.scalars(select(ExplanationBlock))) == []


async def test_lrn03_r6_unknown_exercise_cannot_be_blocked(client):
    content.store.cache_clear()
    h = auth(await with_roles(client, "mohannad-1", "sharia_reviewer"))
    assert (await client.put("/api/learning/explanations/blocks/zz-e9/en", headers=h)).status_code == 404


async def test_lrn03_r6_explanation_samples_are_for_the_reviewer_only(client):
    team = auth(await with_roles(client, "team-1", "team"))
    learner = auth((await register(client, username="joseph-1"))["access_token"])
    for h in (team, learner):
        assert (await client.get("/api/learning/explanations", headers=h)).status_code == 403
        assert (await client.put("/api/learning/explanations/blocks/u01-l3-e1/en", headers=h)).status_code == 403
        assert (await client.delete("/api/learning/explanations/blocks/u01-l3-e1/en", headers=h)).status_code == 403
    assert (await client.get("/api/learning/explanations")).status_code == 401


# --- LRN-04 R2: seen exercises follow the account --------------------------------------


async def test_lrn04_r2_seen_exercises_are_kept_in_the_account_copy_as_a_union(client):
    h = auth((await register(client))["access_token"])
    phone = {
        "mastery": {
            "u01-l3-o1": {"p": 0.5, "seen": True, "answered": True, "lastAnswerAt": "2026-10-03T08:00:00Z", "seenExercises": ["u01-l3-e1"]}
        }
    }
    laptop = {
        "mastery": {
            "u01-l3-o1": {"p": 0.9, "seen": True, "answered": True, "lastAnswerAt": "2026-10-02T08:00:00Z", "seenExercises": ["u01-l3-e2"]}
        }
    }
    await client.put("/api/me/learning", json=phone, headers=h)
    merged = (await client.put("/api/me/learning", json=laptop, headers=h)).json()["mastery"]["u01-l3-o1"]
    assert merged["p"] == 0.5  # the later answer still wins
    assert merged["seenExercises"] == ["u01-l3-e1", "u01-l3-e2"]  # but an exercise seen anywhere stays seen
    again = (await client.get("/api/me/learning", headers=h)).json()["mastery"]["u01-l3-o1"]
    assert again["seenExercises"] == ["u01-l3-e1", "u01-l3-e2"]


async def test_lrn04_r6_mentor_with_shared_progress_sees_no_mistakes_or_review_objectives(client):
    """LRN-04 R6 / LRN-10 R6 (privacy): sharing progress shows the mentor a
    status only, never mastery, mistakes or what is in review."""
    from tests.cmp_helpers import person

    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph-1", gender="m", languages=("en",))
    await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en"]}, headers=joseph.h)
    assert (await client.post("/api/mentors/choose", json={"mentor_id": str(abu.id)}, headers=joseph.h)).status_code == 200
    await client.put("/api/mentors/mine/share", json={"share": True}, headers=joseph.h)
    wrong = {"p": 0.2, "seen": True, "answered": True, "lastAnswerAt": "2026-10-03T08:00:00Z", "seenExercises": ["u01-l3-e1"]}
    await client.put("/api/me/learning", json={"mastery": {"u01-l3-o2": wrong}}, headers=joseph.h)
    rows = (await client.get("/api/inbox/mentees", headers=abu.h)).json()
    assert rows and rows[0]["shares_progress"] is True
    text = str(rows)
    for leak in ("u01-l3", "mastery", "seenExercises", "objective", "review"):
        assert leak not in text


# --- LRN-09 R3: the unit 3 review exercise counts toward the day-one objectives -------


async def test_lrn09_r3_pillars_review_exercise_updates_the_day_one_shahada_objectives(client):
    content.store.cache_clear()
    s = content.store()
    ex = next(e for e in s.lessons["u3-l1"]["exercises"] if e["id"] == "u3-l1-e5")
    day_one = {o["id"] for o in s.lessons["u01-l1"]["objectives"]}
    assert ex["objectives"] == ["u01-l1-o1", "u01-l1-o2"] and set(ex["objectives"]) <= day_one
    served = (await client.get("/api/content?lang=en")).json()["lessons"]["u3-l1"]["exercises"]
    assert next(e for e in served if e["id"] == "u3-l1-e5")["objectives"] == ["u01-l1-o1", "u01-l1-o2"]
