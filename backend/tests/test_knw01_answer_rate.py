"""KNW-01 answer rate (branch knw-01-answer-rate): the failing patterns seen in
production on 2026-10-06, as fixtures. No live model call: OpenRouter is
scripted (tests/knw_fakes.py) and every passage is dummy text (plan rule 6).

Patterns (evidence in the branch report):
- the composer wrote markers as {{ID}} / {{q: ID}} / {{q:ID1, q:ID2}} →
  `malformed_marker` (5 of 7 English rejections);
- English answers honouring the Prophet or a Companion as the stored
  translations do («may Allah's peace and blessings be upon him», «may Allah
  be pleased with him») repeated 6 words of a hadith passage →
  `scripture_copied_outside_marker`;
- «ما هو الوضوء؟» was served the approved «ما فضل الوضوء؟» answer;
- a rejected composition was not retryable, and the app led with «أريد إنسانًا».
"""

from pathlib import Path

from app.knowledge import approved, verify
from app.knowledge.ai import agents, screen
from app.knowledge.ai.textcheck import fix_markers
from tests.knw_fakes import add_passages
from tests.test_knw01_reliability import (
    GOOD_EN,
    Q_EN,
    ROUTE_GENERAL,
    SHAHADA_EN,
    SHAHADA_EN_2,
    SUPPORTED,
    _add_entry_passages,
    _file_entry,
    post,
)

pytest_plugins = ["tests.knw_fakes"]

IDS = {"hadeethenc:en:101", "hadeethenc:en:102", "islamqa:en:5:p1", "live:islamqa:en:7:c1"}

# Dummy English hadith passage in the stored translations' format (honorifics as HadeethEnc writes them).
HADITH_EN = {
    "id": "hadeethenc:en:301",
    "lang": "en",
    "kind": "hadith",
    "quote_text": (
        "Abu Testa (may Allah be pleased with him) reported: The Messenger of Allah (may Allah’s peace and blessings "
        "be upon him) said: TEST dummy saying alpha bravo charlie delta echo foxtrot golf hotel."
    ),
}
# Dummy English verse translation.
VERSE_EN = {
    "id": "quranenc:english_rwwad:99:1",
    "source_id": "quranenc",
    "lang": "en",
    "kind": "quran_translation",
    "ref_key": "99:1",
    "quote_text": "TEST dummy verse remember the test name of your Lord in the morning and the evening and be patient.",
}
VERSE_TL = {
    "id": "quranenc:tagalog_rwwad:99:2",
    "source_id": "quranenc",
    "lang": "tl",
    "kind": "quran_translation",
    "ref_key": "99:2",
    "quote_text": "Nagsabi ang Sugo ni Allāh: TEST alalahanin ninyo ang pangalan ng Panginoon ninyo sa umaga at gabi.",
}


def _retrieved(*rows: dict) -> dict[str, dict]:
    return {r["id"]: {"kind": r.get("kind", "hadith"), **r} for r in rows}


# --- malformed markers (composer) --------------------------------------------------


def test_knw01_answer_rate_marker_forms_are_written_in_the_valid_form():
    assert fix_markers("A {{hadeethenc:en:101}}.", IDS) == "A {{q:hadeethenc:en:101}}."
    assert fix_markers("A {{q: hadeethenc:en:101 }}.", IDS) == "A {{q:hadeethenc:en:101}}."
    assert fix_markers("A {{Q:hadeethenc:en:101}}.", IDS) == "A {{q:hadeethenc:en:101}}."
    assert fix_markers("A {{q:hadeethenc:en:101, q:islamqa:en:5:p1}}.", IDS) == "A {{q:hadeethenc:en:101}} {{q:islamqa:en:5:p1}}."
    assert fix_markers("A {{hadeethenc:en:101; hadeethenc:en:102}}", IDS) == "A {{q:hadeethenc:en:101}} {{q:hadeethenc:en:102}}"
    assert fix_markers("A {{live:islamqa:en:7:c1}}", IDS) == "A {{q:live:islamqa:en:7:c1}}"  # live evidence ids too
    assert fix_markers("A {{q:hadeethenc:en:101}}.", IDS) == "A {{q:hadeethenc:en:101}}."  # valid: unchanged


def test_knw01_answer_rate_marker_fix_never_invents_or_keeps_an_unretrieved_id():
    for text in (
        "A {{hadeethenc:en:999}}.",  # not retrieved
        "A {{q:hadeethenc:en:101, q:hadeethenc:en:999}}.",  # one of two not retrieved: the whole span stays
        "A {{hadeethenc}}.",  # a prefix of an id is not an id
        "A {{}}.",
        "A {{q:hadeethenc:en:101}.",  # broken braces are not a marker
    ):
        assert fix_markers(text, IDS) == text
        assert "malformed_marker" in verify.code_checks({"sufficient": True, "answer": text, "sources": []}, "en", {}) or (
            "unretrieved_reference" in verify.code_checks({"sufficient": True, "answer": text, "sources": []}, "en", {})
        )


def test_knw01_answer_rate_composer_output_fixes_q_prefixed_sources():
    out = agents._composer_out(
        {"sufficient": True, "answer": "A {{hadeethenc:en:101}}", "sources": ["q:hadeethenc:en:101", "q:x:9"]},
        [{"id": "hadeethenc:en:101"}],
    )
    assert out == {"sufficient": True, "answer": "A {{q:hadeethenc:en:101}}", "sources": ["hadeethenc:en:101", "q:x:9"]}


async def test_knw01_answer_rate_marker_without_q_is_answered_first_time(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {**GOOD_EN, "answer": "Nothing deserves worship except Allah. {{hadeethenc:en:101}}"})
    ai.on("support", SUPPORTED)
    b = await post(client, Q_EN)
    assert b["outcome"] == "answered" and b["answer"] == GOOD_EN["answer"]
    assert [s["id"] for s in b["sources"]] == ["hadeethenc:en:101"]
    assert ai.agents_called().count("composer") == 1  # no repair round spent on the marker


async def test_knw01_answer_rate_list_marker_is_answered(client, ai):
    await add_passages(SHAHADA_EN, SHAHADA_EN_2)
    ai.on("router", ROUTE_GENERAL)
    ai.on(
        "composer",
        {
            "sufficient": True,
            "answer": "Nothing deserves worship except Allah {{q:hadeethenc:en:101, q:hadeethenc:en:102}}.",
            "sources": [],
        },
    )
    ai.on("support", SUPPORTED)
    b = await post(client, Q_EN)
    assert b["outcome"] == "answered"
    assert b["answer"] == "Nothing deserves worship except Allah {{q:hadeethenc:en:101}} {{q:hadeethenc:en:102}}."


async def test_knw01_answer_rate_unretrieved_marker_is_still_refused(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    bad = {**GOOD_EN, "answer": "Nothing deserves worship except Allah. {{hadeethenc:en:999}}", "sources": []}
    ai.on("composer", bad, {**bad, "answer": "Nothing at all deserves worship. {{hadeethenc:en:999}}"})
    b = await post(client, Q_EN)
    assert b["outcome"] == "verification_failed" and b["sources"] == [] and "999" not in b["answer"]
    assert "support" not in ai.agents_called()


# --- honorifics vs copied scripture ---------------------------------------------------


def test_knw01_answer_rate_english_honorifics_are_not_copied_scripture():
    retrieved = _retrieved(HADITH_EN)
    for answer in (
        "The Messenger of Allah (may Allah's peace and blessings be upon him) taught kindness. {{q:hadeethenc:en:301}}",
        "The Prophet (peace be upon him) taught kindness. {{q:hadeethenc:en:301}}",
        "Abu Testa (may Allah be pleased with him) heard this teaching. {{q:hadeethenc:en:301}}",
        "The Messenger of Allah, may Allah’s peace and blessings be upon him, taught kindness. {{q:hadeethenc:en:301}}",
    ):
        out = {"sufficient": True, "answer": answer, "sources": ["hadeethenc:en:301"]}
        assert "scripture_copied_outside_marker" not in verify.code_checks(out, "en", retrieved), answer


def test_knw01_answer_rate_model_written_verse_or_hadith_is_still_rejected():
    """A model-written English rendering of a verse or hadith outside a marker
    is rejected, honorifics or not (rules.md §1.3)."""
    retrieved = _retrieved(HADITH_EN, VERSE_EN)
    for answer in (
        # the whole verse in the model's words
        "Allah says: remember the test name of your Lord in the morning and the evening and be patient.",
        # part of a verse
        "We should remember the test name of your Lord in the morning every day.",
        # a hadith wrapped in honorifics: the honorifics are ignored, the saying is not
        "The Messenger of Allah (may Allah's peace and blessings be upon him) said: TEST dummy saying alpha bravo charlie delta.",
        # the saying with the honorific glued in the middle of it
        "He said TEST dummy saying alpha bravo charlie (peace be upon him) delta echo foxtrot golf hotel.",
    ):
        out = {"sufficient": True, "answer": answer + " {{q:hadeethenc:en:301}}", "sources": ["hadeethenc:en:301"]}
        assert "scripture_copied_outside_marker" in verify.code_checks(out, "en", retrieved), answer


def test_knw01_answer_rate_tagalog_accents_do_not_hide_copying():
    """Allāh in the source and Allah in the answer are the same word: folding
    accents can only find more copying."""
    retrieved = _retrieved(VERSE_TL)
    out = {
        "sufficient": True,
        "answer": "Nagsabi ang Sugo ni Allah: TEST alalahanin ninyo ang pangalan ng Panginoon. {{q:quranenc:tagalog_rwwad:99:2}}",
        "sources": ["quranenc:tagalog_rwwad:99:2"],
    }
    assert "scripture_copied_outside_marker" in verify.code_checks(out, "tl", retrieved)
    honorific = {**out, "answer": "Ang Propeta (basbasan siya ni Allāh at pangalagaan) ay nagturo. {{q:quranenc:tagalog_rwwad:99:2}}"}
    assert "scripture_copied_outside_marker" not in verify.code_checks(honorific, "tl", retrieved)


async def test_knw01_answer_rate_english_answer_with_honorific_is_answered(client, ai):
    await add_passages({**HADITH_EN, "context_text": "TEST meaning of the shahada explained"})
    ai.on("router", ROUTE_GENERAL)
    answer = (
        "The Messenger of Allah (may Allah's peace and blessings be upon him) taught the meaning of the shahada. {{q:hadeethenc:en:301}}"
    )
    ai.on("composer", {"sufficient": True, "answer": answer, "sources": ["hadeethenc:en:301"]})
    ai.on("support", SUPPORTED)
    b = await post(client, "What does the shahada mean, TEST?")
    assert b["outcome"] == "answered" and b["answer"] == answer
    assert ai.agents_called().count("composer") == 1


async def test_knw01_answer_rate_repair_is_told_which_sentence_copied_scripture(client, ai):
    await add_passages({**HADITH_EN, "context_text": "TEST meaning of the shahada explained"})
    ai.on("router", ROUTE_GENERAL)
    copied = "He said TEST dummy saying alpha bravo charlie delta echo. {{q:hadeethenc:en:301}}"
    fine = "The shahada has a meaning taught by the Prophet. {{q:hadeethenc:en:301}}"
    ai.on("composer", {"sufficient": True, "answer": f"{fine} {copied}", "sources": []})
    ai.on("composer", {"sufficient": True, "answer": fine, "sources": []})
    ai.on("support", SUPPORTED)
    b = await post(client, "What does the shahada mean, TEST?")
    assert b["outcome"] == "answered" and b["answer"] == fine and "alpha bravo" not in b["answer"]
    repair = [body for agent, body in ai.calls if agent == "composer"][1]["messages"][1]["content"]
    flagged = repair.split("UNSUPPORTED SENTENCES:", 1)[1]
    assert "TEST dummy saying alpha bravo" in flagged and "taught by the Prophet" not in flagged  # only the copying sentence
    assert ai.agents_called().count("support") == 1  # the copying text was never sent to the checker


# --- approved answers: the topic must be the same -------------------------------------


def test_knw01_answer_rate_what_is_wudu_never_matches_the_virtue_of_wudu():
    entry = _file_entry("suggest-wudu-ar")
    assert not any(approved.matches("ما هو الوضوء؟", p, exact_only=False) for p in entry["questions"])
    en = _file_entry("suggest-wudu-en")
    assert not any(approved.matches("What is wudu?", p, exact_only=False) for p in en["questions"])
    # the same topic in other function words still matches
    assert approved.matches("ما هو فضل الوضوء", "ما فضل الوضوء؟", exact_only=False)
    assert approved.matches("What is the virtue of the wudu?", "What is the virtue of wudu?", exact_only=False)


async def test_knw01_answer_rate_what_is_wudu_is_composed_not_served_the_virtue_answer(client, ai):
    entry = _file_entry("suggest-wudu-ar")
    await _add_entry_passages(entry)
    await add_passages({"id": "binbaz:ar:77", "kind": "fatwa", "lang": "ar", "quote_text": "TEST_QUOTE_TEXT الوضوء غسل الأعضاء"})
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": True, "answer": "الوضوء طهارة بالماء. {{q:binbaz:ar:77}}", "sources": ["binbaz:ar:77"]})
    ai.on("support", SUPPORTED)
    b = await post(client, "ما هو الوضوء؟", "ar")
    assert b["outcome"] == "answered" and b["answer"] != entry["answer"]
    assert "composer" in ai.agents_called()


# --- a rejected composition can be retried by the user ------------------------------


async def test_knw01_answer_rate_verification_failed_is_retryable(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    extra = {**GOOD_EN, "answer": GOOD_EN["answer"] + " It must be said 70 times a day."}
    ai.on("composer", extra, extra)
    ai.on("support", {"supported": False, "unsupported": ["It must be said 70 times a day."]})
    b = await post(client, Q_EN)
    assert b["outcome"] == "verification_failed" and b["retryable"] is True
    assert "70 times" not in b["answer"] and b["sources"] == []
    assert ai.agents_called().count("composer") == 2  # still one repair: no automatic loop
    assert "person" not in screen.fixed("verification_failed", "en")  # the reply leads with retry


# --- router prompt (behaviour measured live; see the branch report) -------------------


def test_knw01_answer_rate_router_keeps_general_questions_in_scope():
    text = (Path(agents.__file__).parent / "prompts" / "router.md").read_text(encoding="utf-8")
    assert "Can I pray in jeans?" in text and "is NOT personal" in text  # first-person general questions
    assert "Everyday life as a Muslim is in scope" in text and "«ماذا آكل في حفلة العمل؟»" in text
    assert "When unsure between `danger` and another route, choose `danger`." in text  # danger first, unchanged
