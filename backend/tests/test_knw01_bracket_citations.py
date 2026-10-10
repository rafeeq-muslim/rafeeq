"""KNW-01: citations written as «[islamqa:en:1:p1, …]» (seen 2026-10-10 in an
English personal answer) never reach the learner as raw ids. A bracketed list
of retrieved ids becomes {{q:ID}} markers; anything else that leaves an id as
text is rejected. No live model call; passages are dummy text (plan rule 6)."""

import pytest

from app.knowledge import verify
from app.knowledge.ai.textcheck import fix_bracket_citations, fix_markers, has_raw_id
from tests.knw_fakes import add_passages
from tests.test_knw01_reliability import Q_EN, ROUTE_GENERAL, SHAHADA_EN, SHAHADA_EN_2, SUPPORTED, post

pytest_plugins = ["tests.knw_fakes"]

IDS = {"hadeethenc:en:101", "hadeethenc:en:102", "islamqa:en:193670:p1", "live:binbaz:en:7:c1", "quranenc:english_saheeh:2:255"}


def checks(answer: str, retrieved_ids=IDS) -> list[str]:
    retrieved = {i: {"id": i, "kind": "fatwa", "quote_text": "TEST"} for i in retrieved_ids}
    return verify.code_checks({"sufficient": True, "answer": answer, "sources": []}, "en", retrieved)


def test_knw01_bracketed_retrieved_ids_become_markers():
    assert fix_markers("A rule [islamqa:en:193670:p1].", IDS) == "A rule {{q:islamqa:en:193670:p1}}."
    assert (
        fix_markers("A rule [hadeethenc:en:101, islamqa:en:193670:p1].", IDS)
        == "A rule {{q:hadeethenc:en:101}} {{q:islamqa:en:193670:p1}}."
    )
    assert (
        fix_markers("A rule (live:binbaz:en:7:c1; q:hadeethenc:en:102)", IDS) == "A rule {{q:live:binbaz:en:7:c1}} {{q:hadeethenc:en:102}}"
    )
    assert fix_markers("A verse [quranenc:english_saheeh:2:255]", IDS) == "A verse {{q:quranenc:english_saheeh:2:255}}"


def test_knw01_bracketed_list_with_an_unretrieved_id_is_left_and_rejected():
    for text in ("A rule [islamqa:en:999:p1].", "A rule [hadeethenc:en:101, islamqa:en:999:p1]."):
        assert fix_markers(text, IDS) == text  # never invents, never drops an id silently
        assert "malformed_marker" in checks(text)


def test_knw01_a_raw_id_outside_brackets_is_rejected():
    assert "malformed_marker" in checks("As islamqa:en:193670:p1 says, a rule. {{q:hadeethenc:en:101}}")
    assert "malformed_marker" in checks("A rule {{q:hadeethenc:en:101}} (see live:binbaz:en:7:c1)")


@pytest.mark.parametrize(
    "text",
    [
        "Read Ayat al-Kursi (2:255) at night [note: in the evening].",
        "Pray at 10:30:00 (the time where you live).",
        "IslamQA explains it (fatwa 193670). {{q:islamqa:en:193670:p1}}",
        "A Muslim says: la ilaha illa Allah.",
    ],
)
def test_knw01_ordinary_brackets_and_references_are_not_ids(text):
    assert fix_bracket_citations(text, IDS) == text
    assert not has_raw_id(verify.strip_markers(text))


async def test_knw01_bracketed_citation_is_answered_with_markers(client, ai):
    await add_passages(SHAHADA_EN, SHAHADA_EN_2)
    ai.on("router", ROUTE_GENERAL)
    ai.on(
        "composer",
        {"sufficient": True, "answer": "Nothing deserves worship except Allah [hadeethenc:en:101, hadeethenc:en:102].", "sources": []},
    )
    ai.on("support", SUPPORTED)
    b = await post(client, Q_EN)
    assert b["outcome"] == "answered"
    assert b["answer"] == "Nothing deserves worship except Allah {{q:hadeethenc:en:101}} {{q:hadeethenc:en:102}}."
    assert [s["id"] for s in b["sources"]] == ["hadeethenc:en:101", "hadeethenc:en:102"]


async def test_knw01_bracketed_unretrieved_citation_is_never_shown(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    bad = {"sufficient": True, "answer": "Nothing deserves worship except Allah [islamqa:en:999:p1].", "sources": []}
    ai.on("composer", bad)
    ai.on("composer", bad)  # the one repair writes it again
    b = await post(client, Q_EN)
    assert b["outcome"] != "answered" and b["sources"] == []
    assert "islamqa:en:999" not in b["answer"]
