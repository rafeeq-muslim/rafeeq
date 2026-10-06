"""KNW-05 R2: the reviewer sees each citation beside its stored source text,
and a card citing an id that is not in the record is refused before review.
Hadith texts are dummies (never real scripture)."""

import importlib.util
import json

import pytest

from app.core.config import get_settings
from app.learning import content, team_units
from tests.conftest import auth, with_roles
from tests.knw_fakes import add_passages

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

HADITH = {
    "id": "hadeethenc:en:1234",
    "lang": "en",
    "quote_text": "TEST_HADITH_TEXT 1234",
    "meta": {"grade": "TEST_GRADE", "attribution": "TEST_ATTRIBUTION", "reference": "TEST_REFERENCE"},
}


@pytest.fixture
def store(monkeypatch):
    unit = {
        "id": "u9",
        "order": 9,
        "title": {"ar": "TEST", "en": "TEST", "tl": "TEST"},
        "lessons": [
            {
                "id": "u9-l1",
                "title": {"ar": "TEST", "en": "TEST", "tl": "TEST"},
                "cards": [
                    {
                        "id": "u9-l1-c1",
                        "kind": "hadith",
                        "hadith_ids": [1234, 99999],
                        "text": {"ar": "TEST", "en": "TEST card", "tl": "TEST"},
                    },
                    {"id": "u9-l1-c2", "kind": "text", "text": {"ar": "TEST", "en": "TEST no citation", "tl": "TEST"}},
                ],
                "objectives": [],
                "exercises": [],
            }
        ],
    }
    out_unit, lessons = team_units.convert(unit, "unit-09")
    s = content.ContentStore(units=[out_unit], lessons={x["id"]: x for x in lessons})
    monkeypatch.setattr(content, "store", lambda: s)
    return s


async def test_knw05_r2_reviewer_sees_the_cited_hadith_text_grade_and_reference_from_the_record(client, ai, store):
    await add_passages(HADITH)
    team = await with_roles(client, "team-1", "team")
    d = (await client.get("/api/review/items/lesson/u9-l1", headers=auth(team))).json()
    en = d["langs"]["en"]
    assert en["current"]["cards"][0]["hadith_ids"] == [1234, 99999]
    assert en["hadith"]["1234"] == {
        "text": "TEST_HADITH_TEXT 1234",
        "grade": "TEST_GRADE",
        "attribution": "TEST_ATTRIBUTION",
        "reference": "TEST_REFERENCE",
        "url": "https://example.test/hadeethenc:en:1234",
        "version": "test-1",
    }
    assert en["hadith"]["99999"] is None  # not in the record: shown as missing, never as other text
    assert d["langs"]["tl"]["hadith"] == {"1234": None, "99999": None}  # each language from its own record


async def test_knw05_r2_a_card_without_hadith_ids_keeps_its_learner_view_unchanged(store):
    # Cards without ids keep the exact view (and so the review hash) they had before.
    lesson = store.lessons["u9-l1"]
    assert "hadith_ids" not in lesson["cards"][1]


def _check_content():
    path = get_settings().content_dir / "check_content.py"
    spec = importlib.util.spec_from_file_location("check_content", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _unit(cards):
    return {"lessons": [{"cards": cards}]}


def test_knw05_r2_content_check_refuses_an_unknown_ayah(tmp_path):
    cc = _check_content()
    errors, warnings = [], []
    cc.check_citations(
        _unit(
            [
                {"id": "c1", "kind": "quran", "ref": "2:287"},
                {"id": "c2", "kind": "quran", "ref": "115:1"},
                {"id": "c3", "kind": "quran", "ref": "1:1-7"},
            ]
        ),
        errors,
        warnings,
        tmp_path,
    )
    assert len(errors) == 2 and errors[0].startswith("c1: unknown ayah") and errors[1].startswith("c2: unknown surah")


def test_knw05_r2_content_check_refuses_a_hadith_id_missing_from_the_record(tmp_path):
    cc = _check_content()
    rows = [{"ref_key": "1234", "lang": lg} for lg in ("ar", "en", "tl")] + [{"ref_key": "77", "lang": "ar"}]
    (tmp_path / "hadeethenc.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf8")
    errors, warnings = [], []
    cc.check_citations(
        _unit(
            [
                {"id": "ok", "kind": "hadith", "hadith_ids": [1234]},
                {"id": "unknown", "kind": "hadith", "hadith_ids": [99999]},
                {"id": "bad", "kind": "text", "contains_hadith": True, "hadith_ids": ["abc"]},
                {"id": "partial", "kind": "hadith", "hadith_ids": [77]},
            ]
        ),
        errors,
        warnings,
        tmp_path,
    )
    assert errors == ["unknown: hadith 99999 is not in the stored HadeethEnc corpus", "bad: hadith id 'abc' is not a HadeethEnc id"]
    assert warnings == ["partial: hadith 77 has no stored record in en, tl"]


def test_knw05_r2_shipped_unit_has_no_unknown_citation():
    cc = _check_content()
    for f in sorted((get_settings().content_dir / "units").glob("*/unit.json")):
        errors: list[str] = []
        cc.check_citations(json.loads(f.read_text(encoding="utf8")), errors, [], f.parent)
        assert errors == [], f


# --- KNW-05 R2 ex2 on the pipeline lessons and other learner content -------------


def _lesson_unit(*quran):
    cards = [{"id": f"u9-l1-c{i}", "kind": "text", "quran": q} for i, q in enumerate(quran, 1)]
    return {"lessons": [{"id": "u9-l1", "cards": cards}]}


def test_knw05_r2_content_check_refuses_a_lesson_card_with_an_unknown_ayah(tmp_path):
    cc = _check_content()
    errors: list[str] = []
    cc.check_citations(
        _lesson_unit(
            {"sura": 2, "ayat": [21, 21]},
            {"sura": 2, "ayat": [287, 287]},
            {"sura": 1, "ayat": [1, 8]},
            {"sura": 115, "ayat": [1, 1]},
            {"sura": 2, "ayat": [21]},
            None,
        ),
        errors,
        [],
        tmp_path,
    )
    assert [e.split(":")[0] for e in errors] == ["u9-l1-c2", "u9-l1-c3", "u9-l1-c4", "u9-l1-c5"]
    assert "unknown ayah in '2:287'" in errors[0] and "unknown ayah in '1:1-8'" in errors[1]
    assert "unknown surah" in errors[2] and "malformed Quran reference" in errors[3]


def _learner_root(tmp_path, *, excerpt=None, recitation=None, daily_ids=()):
    root = tmp_path / "content"
    (root / "lessons").mkdir(parents=True)
    (root / "units").mkdir()
    (root / "discover").mkdir()
    lesson = {"id": "u9-l1", "cards": [{"id": "u9-l1-c1", "kind": "text", "quran": {"sura": 42, "ayat": [11, 11]}}]}
    (root / "lessons" / "u9-l1.json").write_text(json.dumps(lesson), encoding="utf8")
    excerpts = {"cards": {"u9-l1-c1": excerpt or {"ref": "42:11", "verse_words": 3}}}
    (root / "quran_excerpts.json").write_text(json.dumps(excerpts), encoding="utf8")
    verses = recitation or [{"ref": "42:11", "cards": ["u9-l1-c1"]}]
    (root / "quran_recitation.json").write_text(json.dumps({"verses": verses}), encoding="utf8")
    daily = {"cards": [{"id": f"hadeethenc-{h}", "hadith_id": h} for h in daily_ids]}
    (root / "discover" / "daily-cards.json").write_text(json.dumps(daily), encoding="utf8")
    return root


def _corpus(tmp_path):
    # Dummy records (never real scripture): a 3-word verse 42:11 and hadith 1234.
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    verse = {"kind": "quran_arabic", "lang": "ar", "ref_key": "42:11", "quote_text": "TEST TEST TEST"}
    (corpus / "quranenc.jsonl").write_text(json.dumps(verse) + "\n", encoding="utf8")
    rows = [{"ref_key": "1234", "lang": lg} for lg in ("ar", "en", "tl")]
    (corpus / "hadeethenc.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf8")
    return corpus


def test_knw05_r2_learner_content_check_refuses_a_wrong_excerpt_recitation_or_daily_hadith(tmp_path):
    cc = _check_content()
    root = _learner_root(
        tmp_path,
        excerpt={"ref": "42:12", "verse_words": 3},
        recitation=[{"ref": "42:11", "cards": ["u9-l1-c1", "u9-l1-c9"]}, {"ref": "42:54", "cards": []}],
        daily_ids=[1234, 99999],
    )
    errors: list[str] = []
    cc.check_learner_content(root, errors, [], _corpus(tmp_path))
    assert errors == [
        "quran_excerpts.json u9-l1-c1: ref 42:12 but the card shows 42:11",
        "quran_excerpts.json u9-l1-c1: verse 42:12 has no stored Arabic record",
        "quran_recitation.json 42:11: card u9-l1-c9 shows no such card",
        "quran_recitation.json 42:54: unknown ayah in '42:54' (surah 42 has 53)",
        "daily-cards.json hadeethenc-99999: hadith 99999 is not in the stored HadeethEnc corpus",
    ]


def test_knw05_r2_learner_content_check_refuses_excerpt_words_that_do_not_match_the_stored_verse(tmp_path):
    cc = _check_content()
    root = _learner_root(tmp_path, excerpt={"ref": "42:11", "verse_words": 19})
    errors: list[str] = []
    cc.check_learner_content(root, errors, [], _corpus(tmp_path))
    assert errors == ["quran_excerpts.json u9-l1-c1: verse_words 19 but the stored verse 42:11 has 3 words"]


def test_knw05_r2_learner_content_check_without_the_corpus_still_checks_verse_ranges(tmp_path):
    cc = _check_content()
    root = _learner_root(tmp_path, excerpt={"ref": "42:99", "verse_words": 3}, daily_ids=[99999])
    errors, warnings = [], []
    cc.check_learner_content(root, errors, warnings, tmp_path / "no-corpus")
    assert errors == ["quran_excerpts.json u9-l1-c1: unknown ayah in '42:99' (surah 42 has 53)"]
    assert any("verse_words not checked" in w for w in warnings) and any("hadith ids not checked" in w for w in warnings)


def test_knw05_r2_shipped_lessons_and_learner_content_have_no_unknown_citation(tmp_path):
    # Without the corpus (as in CI): verse ranges, excerpt and recitation refs.
    cc = _check_content()
    errors: list[str] = []
    cc.check_learner_content(get_settings().content_dir, errors, [], tmp_path)
    assert errors == []


def test_knw05_r2_shipped_learner_content_matches_the_stored_corpus():
    cc = _check_content()
    corpus = cc.corpus_dir()
    if not (corpus / "quranenc.jsonl").exists() or not (corpus / "hadeethenc.jsonl").exists():
        pytest.skip("approved-source corpus not on this machine (RAFEEQ_DATA_DIR)")
    errors: list[str] = []
    cc.check_learner_content(get_settings().content_dir, errors, [], corpus)
    assert errors == []
