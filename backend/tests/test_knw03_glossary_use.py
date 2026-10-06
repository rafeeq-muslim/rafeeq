"""KNW-03 R3 and R5 with a fixture glossary: the composer and the explainer
receive the approved terms; a team card written with a non-approved spelling
is flagged for the reviewer; a concept without an approved term in a
language is recorded for review. The repository's terms.json is empty, so
with no fixture the model input is exactly as before.

Glossary entries here are test fixtures, not approved Rafeeq terms."""

import importlib.util
import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.knowledge import glossary
from app.knowledge.models import GlossaryTerm
from app.learning import content
from tests.conftest import auth, with_roles, withdraw
from tests.knw_fakes import add_passages

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

TERMS = [
    {
        "concept": "الوضوء",
        "langs": {
            "en": {"term": "wudu", "alternates": ["ablution", "wudhu"], "definition": "TEST_DEF", "source_ids": []},
            "ar": {"term": "الوضوء", "alternates": ["التوضي"], "definition": "", "source_ids": []},
        },
    },
    {"concept": "الصلاة", "langs": {"en": {"term": "salah", "alternates": ["namaz"], "definition": "", "source_ids": []}}},
]
WUDU = {"id": "hadeethenc:en:11", "lang": "en", "quote_text": "TEST_QUOTE_TEXT wudu washing before prayer", "context_text": ""}
WUDU_TL = {"id": "hadeethenc:tl:11", "lang": "tl", "quote_text": "TEST_QUOTE_TEXT wudu paghuhugas bago magdasal", "context_text": ""}
ROUTE = {"route": "general", "level": "A"}
SUPPORTED = {"supported": True, "unsupported": []}


@pytest.fixture
def terms(monkeypatch):
    data = glossary.validate(json.loads(json.dumps(TERMS)))
    monkeypatch.setattr(glossary, "load", lambda: data)
    return data


async def ask(client, ai, passage, lang, answer):
    await add_passages(passage)
    ai.on("router", ROUTE).on("composer", {"sufficient": True, "answer": answer, "sources": [passage["id"]]}).on("support", SUPPORTED)
    r = await client.post("/api/ask", json={"question": "TEST how is wudu done before prayer", "lang": lang})
    assert r.status_code == 200, r.text
    return r.json(), next(b for a, b in ai.calls if a == "composer")["messages"][1]["content"]


# --- R3: the assistant and the explainer use the approved term ---------------------


async def test_knw03_r3_composer_receives_the_approved_terms_in_the_askers_language(client, ai, terms):
    b, user = await ask(client, ai, WUDU, "en", "Wudu is washing before prayer.")
    assert b["outcome"] == "answered"
    assert "GLOSSARY (approved term in LANGUAGE for each concept):" in user
    assert "- الوضوء: wudu (not: ablution, wudhu)" in user and "- الصلاة: salah (not: namaz)" in user


async def test_knw03_r3_without_approved_terms_the_composer_input_is_unchanged(client, ai):
    assert glossary.load() == []  # the shipped content/glossary/terms.json is still empty
    _, user = await ask(client, ai, WUDU, "en", "Wudu is washing before prayer.")
    assert "GLOSSARY" not in user


async def test_knw03_r2_returned_term_is_not_given_to_the_composer(client, ai, terms):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "glossary_term", "الصلاة", "en")
    _, user = await ask(client, ai, WUDU, "en", "Wudu is washing before prayer.")
    assert "wudu (not: ablution, wudhu)" in user and "salah" not in user


async def test_knw03_r3_explainer_receives_the_approved_terms(client, ai, terms, monkeypatch):
    lesson = {
        "id": "t1",
        "unit": "tu",
        "title": {"en": "TEST_LESSON"},
        "cards": [{"id": "t1-c1", "text": {"en": "TEST_CARD_TEXT wudu is done before salah."}}],
        "objectives": [{"id": "t1-o1", "text": {"en": "TEST"}, "cards": ["t1-c1"]}],
        "exercises": [
            {
                "id": "t1-e1",
                "type": "choose",
                "objectives": ["t1-o1"],
                "cards": ["t1-c1"],
                "prompt": {"en": "When?"},
                "options": [{"id": "a", "text": {"en": "Before"}}, {"id": "b", "text": {"en": "After"}}],
                "answer": "a",
            }
        ],
    }
    s = content.ContentStore(units=[{"id": "tu", "order": 1, "title": {"en": "TEST_UNIT"}, "lessons": ["t1"]}], lessons={"t1": lesson})
    monkeypatch.setattr(content, "store", lambda: s)
    ai.on("explainer", {"text": "Wudu comes before salah, as the card says."}).on("support", SUPPORTED)
    r = await client.post("/api/learning/explain", json={"lesson_id": "t1", "exercise_id": "t1-e1", "lang": "en", "answer": "b"})
    assert r.json()["text"]
    user = next(b for a, b in ai.calls if a == "explainer")["messages"][1]["content"]
    assert "GLOSSARY" in user and "- الوضوء: wudu (not: ablution, wudhu)" in user


# --- R3 ex2: a team card with a non-approved spelling is flagged for the reviewer ---


def test_knw03_r3_non_approved_spelling_is_found_and_the_approved_term_is_not(terms):
    flags = glossary.spelling_flags("Make wudhu, then pray. TEST Ablution is ...", "en")
    assert flags == [
        {"concept": "الوضوء", "found": "ablution", "term": "wudu"},
        {"concept": "الوضوء", "found": "wudhu", "term": "wudu"},
    ]
    assert glossary.spelling_flags("Make wudu, then pray salah.", "en") == []
    assert glossary.spelling_flags("ثم التوضي", "ar") == [{"concept": "الوضوء", "found": "التوضي", "term": "الوضوء"}]


async def test_knw03_r3_review_desk_flags_a_card_using_a_non_approved_spelling(client, terms, monkeypatch):
    lesson = {
        "id": "u1-l1",
        "unit": "u1",
        "title": {"en": "TEST"},
        "cards": [{"id": "u1-l1-c1", "kind": "text", "text": {"en": "TEST Make wudhu first."}}],
        "objectives": [],
        "exercises": [],
    }
    s = content.ContentStore(units=[{"id": "u1", "order": 1, "title": {"en": "U"}, "lessons": ["u1-l1"]}], lessons={"u1-l1": lesson})
    monkeypatch.setattr(content, "store", lambda: s)
    team = await with_roles(client, "team-1", "team")
    d = (await client.get("/api/review/items/lesson/u1-l1", headers=auth(team))).json()
    assert d["langs"]["en"]["glossary_flags"] == [{"concept": "الوضوء", "found": "wudhu", "term": "wudu"}]


def _check_content():
    path = get_settings().content_dir / "check_content.py"
    spec = importlib.util.spec_from_file_location("check_content", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_knw03_r3_content_check_flags_a_non_approved_spelling(tmp_path, capsys):
    cc = _check_content()
    (tmp_path / "terms.json").write_text(json.dumps({"terms": TERMS}, ensure_ascii=False), encoding="utf8")
    warnings: list[str] = []
    unit = {"lessons": [{"cards": [{"id": "c1", "text": {"ar": "اغسل", "en": "Make wudhu first", "tl": "TEST"}}]}]}
    cc.check_glossary(unit, warnings, cc.load_glossary(tmp_path / "terms.json"))
    assert len(warnings) == 1 and "'wudhu'" in warnings[0] and "'wudu'" in warnings[0]


# --- R5: no approved term in a language → recorded for review, never translated ----


async def test_knw03_r5_term_without_approved_translation_is_recorded_for_review(client, ai, terms):
    b, user = await ask(client, ai, WUDU_TL, "tl", "TEST Ang wudu ay paghuhugas bago magdasal.")
    assert b["outcome"] == "answered"
    assert "GLOSSARY" not in user  # no Tagalog terms: the passage's wording is kept, nothing is translated
    async with SessionLocal() as s:
        rows = [(r.concept, r.lang, r.status, r.term) for r in await s.scalars(select(GlossaryTerm))]
    assert rows == [("الوضوء", "tl", "missing", "")]  # concept and language only, never the question
    # recorded once, however often it comes up
    await ask(client, ai, {**WUDU_TL, "id": "hadeethenc:tl:12"}, "tl", "TEST Ang wudu ay paghuhugas.")
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    r = (await client.get("/api/review/glossary/missing", headers=auth(reviewer))).json()
    assert r == {"items": [{"concept": "الوضوء", "lang": "tl"}]}
    assert (await client.get("/api/review/glossary/missing")).status_code in (401, 403)


async def test_knw03_r5_a_concept_with_an_approved_term_is_not_recorded(client, ai, terms):
    await ask(client, ai, WUDU, "en", "Wudu is washing before prayer.")
    async with SessionLocal() as s:
        assert list(await s.scalars(select(GlossaryTerm))) == []


def test_knw03_shipped_glossary_file_is_valid():
    data = json.loads(Path(get_settings().content_dir / "glossary" / "terms.json").read_text(encoding="utf-8"))
    glossary.validate(data["terms"])
