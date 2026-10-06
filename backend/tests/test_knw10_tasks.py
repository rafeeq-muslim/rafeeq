"""KNW-10 assistant learning tasks (with LRN-03 R6, LRN-07, LRN-10 R5):
one test per example. Lessons here are dummies seeded through the content
store the review provider reads (merged content is served directly since
2026-10-06, rules.md §1.4); model calls are scripted (tests/knw_fakes.py)."""

import pytest
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.knowledge.models import AiCall, AnswerLog, ExplanationLog
from app.learning import content
from app.learning.models import ExplanationBlock
from tests.conftest import with_roles, withdraw
from tests.knw_fakes import add_passages

LESSON = {
    "title": {"en": "TEST_LESSON_ONE"},
    "cards": [{"id": "t1-c1", "text": {"en": "TEST_CARD_TEXT the intention is made in the heart, as the heart's resolve to worship."}}],
    "objectives": [{"id": "t1-o1", "text": {"en": "Knows where the intention is made"}, "cards": ["t1-c1"]}],
    "exercises": [
        {
            "id": "t1-e1",
            "type": "choose",
            "objectives": ["t1-o1"],
            "cards": ["t1-c1"],
            "prompt": {"en": "Where is the intention made?"},
            "options": [{"id": "a", "text": {"en": "In the heart"}}, {"id": "b", "text": {"en": "With the tongue"}}],
            "answer": "a",
        }
    ],
}
LESSON_TWO = {
    "title": {"en": "TEST_LESSON_TWO"},
    "cards": [],
    "objectives": [{"id": "t2-o1", "text": {"en": "Orders the first steps"}, "cards": []}],
    "exercises": [],
}
EXPLAIN = {"lesson_id": "t1", "exercise_id": "t1-e1", "lang": "en", "answer": "b"}
SUPPORTED = {"supported": True, "unsupported": []}
PASSAGE = {
    "id": "hadeethenc:en:7",
    "lang": "en",
    "quote_text": "TEST_QUOTE_TEXT tayammum dry ablution",
    "context_text": "TEST_CONTEXT_TEXT",
}

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture


@pytest.fixture
def seed(monkeypatch):
    """Put dummy lessons (in the {ar,en,tl} format) in the merged content the
    lesson review provider reads, replacing the repository's lessons."""

    def _seed(*lessons: tuple[str, dict]) -> content.ContentStore:
        ids = [lid for lid, _ in lessons]
        s = content.ContentStore(
            units=[{"id": "tu", "order": 1, "title": {"en": "TEST_UNIT"}, "lessons": ids}],
            lessons={lid: {**view, "id": lid, "unit": "tu", "order": i} for i, (lid, view) in enumerate(lessons, 1)},
        )
        monkeypatch.setattr(content, "store", lambda: s)
        return s

    return _seed


async def rows(model):
    async with SessionLocal() as s:
        return list(await s.scalars(select(model)))


# --- R1 / LRN-03 R6 -----------------------------------------------------------


async def test_knw10_r1_explanation_rewords_card_in_learner_language(client, ai, seed):
    seed(("t1", LESSON))
    text = "The intention is made in the heart. It is the heart's resolve to worship, so it is not said with the tongue."
    ai.on("explainer", {"text": text}).on("support", SUPPORTED)
    r = await client.post("/api/learning/explain", json=EXPLAIN)
    assert r.status_code == 200 and r.json() == {"text": text}
    explainer = next(b for a, b in ai.calls if a == "explainer")
    user = explainer["messages"][1]["content"]
    assert "LANGUAGE: English" in user and "TEST_CARD_TEXT" in user and "With the tongue" in user
    (log,) = await rows(ExplanationLog)  # R4: kept with exercise and language, no identity
    assert (log.exercise_id, log.lang, log.text) == ("t1-e1", "en", text)
    assert {c.name for c in ExplanationLog.__table__.columns} == {"id", "at", "exercise_id", "lang", "text"}


async def test_knw10_r1_lesson_not_in_content_gets_no_explanation(client, ai, seed):
    seed(("t2", LESSON_TWO))
    r = await client.post("/api/learning/explain", json=EXPLAIN)
    assert r.json() == {"text": None} and ai.calls == []


async def test_knw10_r1_returned_lesson_gets_no_explanation(client, ai, seed):
    seed(("t1", LESSON))
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "lesson", "t1", "en", note="The card needs correcting")
    r = await client.post("/api/learning/explain", json=EXPLAIN)
    assert r.json() == {"text": None} and ai.calls == []  # only text learners can see is ever explained


# --- R2 -----------------------------------------------------------------------


async def test_knw10_r2_explanation_citing_hadith_is_not_returned(client, ai, seed):
    seed(("t1", LESSON))
    ai.on("explainer", {"text": 'The Prophet said: "TEST_ADDED_HADITH". So the intention is in the heart.'})
    r = await client.post("/api/learning/explain", json=EXPLAIN)
    assert r.json() == {"text": None}
    assert "support" not in ai.agents_called()  # stopped by the fixed checks
    assert await rows(ExplanationLog) == []


async def test_knw10_r2_explanation_with_unsupported_addition_is_not_returned(client, ai, seed):
    seed(("t1", LESSON))
    ai.on("explainer", {"text": "The intention is in the heart, and one school also requires saying it aloud."})
    ai.on("support", {"supported": False, "unsupported": ["one school also requires saying it aloud"]})
    r = await client.post("/api/learning/explain", json=EXPLAIN)
    assert r.json() == {"text": None}


async def test_knw10_r2_outage_returns_null_without_error(client, ai, seed):
    seed(("t1", LESSON))
    ai.on("explainer", 503, 503)
    r = await client.post("/api/learning/explain", json=EXPLAIN)
    assert r.status_code == 200 and r.json() == {"text": None}


async def test_knw10_r2_blocked_exercise_gets_no_explanation(client, ai, seed):
    seed(("t1", LESSON))
    async with SessionLocal() as s:
        s.add(ExplanationBlock(exercise_id="t1-e1", lang="en"))
        await s.commit()
    r = await client.post("/api/learning/explain", json=EXPLAIN)
    assert r.json() == {"text": None} and ai.calls == []


# --- R3 / LRN-07 --------------------------------------------------------------


async def test_knw10_r3_what_next_in_chat_asks_for_summary(client, ai):
    r = await client.post("/api/ask", json={"question": "What should I learn now?", "lang": "en"})
    b = r.json()
    assert b["outcome"] == "learning_guide" and b["sources"] == []
    assert ai.calls == []  # never answered from Sharia sources


async def test_knw10_r3_guide_message_from_summary_only(client, ai, seed):
    seed(("t1", LESSON), ("t2", LESSON_TWO))
    text = "You mastered «Knows where the intention is made». Next, «TEST_LESSON_TWO» builds on it."
    ai.on("guide", {"text": text}).on("support", SUPPORTED)
    r = await client.post("/api/learning/guide", json={"lang": "en", "mastered": ["t1-o1"], "next": {"lesson_id": "t2"}})
    assert r.json() == {"text": text}
    guide = next(b for a, b in ai.calls if a == "guide")
    user = guide["messages"][1]["content"]
    assert "Knows where the intention is made" in user and "TEST_LESSON_TWO" in user
    assert "TEST_CARD_TEXT" not in user  # no lesson content, names only


async def test_knw10_r3_guide_with_ruling_is_rejected(client, ai, seed):
    seed(("t1", LESSON), ("t2", LESSON_TWO))
    ai.on("guide", {"text": "You mastered «Knows where the intention is made». Remember that wudu without intention is invalid."})
    ai.on("support", {"supported": False, "unsupported": ["wudu without intention is invalid"]})
    r = await client.post("/api/learning/guide", json={"lang": "en", "mastered": ["t1-o1"], "next": {"lesson_id": "t2"}})
    assert r.json() == {"text": None}


async def test_knw10_r3_guide_with_unknown_name_is_rejected(client, ai, seed):
    seed(("t1", LESSON), ("t2", LESSON_TWO))
    ai.on("guide", {"text": "You mastered «The rulings of fasting». Next is «TEST_LESSON_TWO»."})
    r = await client.post("/api/learning/guide", json={"lang": "en", "mastered": ["t1-o1"], "next": {"lesson_id": "t2"}})
    assert r.json() == {"text": None}
    assert "support" not in ai.agents_called()


async def test_knw10_r3_guide_outage_returns_null(client, ai, seed):
    seed(("t1", LESSON))
    ai.on("guide", 503, 503)
    r = await client.post("/api/learning/guide", json={"lang": "en", "mastered": ["t1-o1"]})
    assert r.status_code == 200 and r.json() == {"text": None}


# --- R4 -----------------------------------------------------------------------


async def test_knw10_r4_summary_is_not_stored(client, ai, seed):
    seed(("t1", LESSON), ("t2", LESSON_TWO))
    ai.on("guide", {"text": "Well done on «Knows where the intention is made»."}).on("support", SUPPORTED)
    await client.post("/api/learning/guide", json={"lang": "en", "mastered": ["t1-o1"], "next": {"lesson_id": "t2"}, "returning": True})
    assert await rows(ExplanationLog) == [] and await rows(AnswerLog) == [] and await rows(OutboxEvent) == []
    calls = await rows(AiCall)
    assert calls and {c.agent for c in calls} == {"guide", "guide_checker"}  # cost rows only, no text


# --- R5 / LRN-10 R5 -----------------------------------------------------------


async def _answered(ai, route: str) -> None:
    ai.on("router", {"route": route, "level": "A" if route == "general" else "C"})
    ai.on("composer", {"sufficient": True, "answer": "It is done with clean earth when water is missing.", "sources": ["hadeethenc:en:7"]})
    ai.on("support", SUPPORTED)


async def test_knw10_r5_consented_question_sends_objective_id_only(client, ai, seed):
    seed(("t1", LESSON))
    await add_passages(PASSAGE)
    await _answered(ai, "general")
    ai.on("tagger", {"objective_id": "t1-o1"})
    question = "How do I do tayammum dry ablution?"
    b = (await client.post("/api/ask", json={"question": question, "lang": "en", "consent_objectives": True})).json()
    assert b["outcome"] == "answered" and b["objective_id"] == "t1-o1"
    (event,) = [e for e in await rows(OutboxEvent) if e.name == "ObjectiveAsked"]
    assert event.payload == {"objective_id": "t1-o1"}


@pytest.mark.parametrize("route", ["sensitive", "personal"])
async def test_knw10_r5_sensitive_routes_are_never_tagged(client, ai, route, seed):
    seed(("t1", LESSON))
    await add_passages(PASSAGE)
    await _answered(ai, route)
    b = (
        await client.post("/api/ask", json={"question": "How do I do tayammum dry ablution?", "lang": "en", "consent_objectives": True})
    ).json()
    assert b["outcome"] == "answered" and b["objective_id"] is None
    assert "tagger" not in ai.agents_called()
    assert not [e for e in await rows(OutboxEvent) if e.name == "ObjectiveAsked"]


async def test_knw10_r5_danger_is_never_tagged(client, ai, seed):
    seed(("t1", LESSON))
    b = (await client.post("/api/ask", json={"question": "They hurt me at home", "lang": "en", "consent_objectives": True})).json()
    assert b["outcome"] == "danger" and ai.calls == []
    assert [e.name for e in await rows(OutboxEvent)] == ["DangerDetected"]


async def test_knw10_r5_no_consent_no_event(client, ai, seed):
    seed(("t1", LESSON))
    await add_passages(PASSAGE)
    await _answered(ai, "general")
    b = (await client.post("/api/ask", json={"question": "How do I do tayammum dry ablution?", "lang": "en"})).json()
    assert b["outcome"] == "answered" and b["objective_id"] is None
    assert "tagger" not in ai.agents_called()
    assert not [e for e in await rows(OutboxEvent) if e.name == "ObjectiveAsked"]


# --- R6 -----------------------------------------------------------------------


async def test_knw10_r6_reliability_test_blocks_planted_additions(ai):
    from app.knowledge.eval.runner import task_checks

    unsupported = {"supported": False, "unsupported": ["added"]}
    ai.on("support", unsupported, unsupported, SUPPORTED)
    ai.on("explainer", {"text": "It must be done before the prayer, as the card explains."})
    r = await task_checks()
    assert r["planted_blocked"] == "3/3"
    clean = r["rows"][-1]
    assert clean["planted"] is False and clean["blocked"] is False
