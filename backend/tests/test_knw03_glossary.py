"""KNW-03 unified glossary (approved-term service): one test per example built.

Since 2026-10-06 (rules.md §1.4) terms are reviewed before they are merged, so
a merged term is served directly; a term the reviewer returns is withdrawn in
that language until corrected."""

import pytest

from app.knowledge import glossary
from tests.conftest import with_roles, withdraw


@pytest.fixture
def terms(monkeypatch):
    data = glossary.validate(
        [
            {
                "concept": "الوضوء",
                "langs": {
                    "tl": {
                        "term": "wuḍū'",
                        "alternates": [],
                        "definition": "Paglilinis bago magdasal",
                        "source_ids": ["quranenc:tagalog_rwwad:5:6"],
                    }
                },
            },
            {"concept": "الزكاة", "langs": {"tl": {"term": "zakāh", "definition": "", "source_ids": []}}},
        ]
    )
    monkeypatch.setattr(glossary, "load", lambda: data)
    return data


async def test_knw03_r1_merged_term_served_with_definition_and_source(client, terms):
    t, _ = (await client.get("/api/glossary?lang=tl")).json()["terms"]
    assert t == {
        "concept": "الوضوء",
        "term": "wuḍū'",
        "alternates": [],
        "definition": "Paglilinis bago magdasal",
        "source_ids": ["quranenc:tagalog_rwwad:5:6"],
    }


def test_knw03_r1_second_term_for_language_is_rejected():
    with pytest.raises(glossary.DuplicateTerm):
        glossary.validate(
            [{"concept": "الوضوء", "langs": {"en": {"term": "wudu"}}}, {"concept": "الوضوء", "langs": {"en": {"term": "ablution"}}}]
        )


async def test_knw03_r2_merged_term_served_only_in_its_written_languages(client, terms):
    # Both concepts are merged in Tagalog: served as written, in file order.
    assert [t["term"] for t in (await client.get("/api/glossary?lang=tl")).json()["terms"]] == ["wuḍū'", "zakāh"]
    # Neither has English text: nothing is machine-translated (R5).
    assert (await client.get("/api/glossary?lang=en")).json()["terms"] == []


async def test_knw03_r2_returned_term_withdrawn_until_corrected(client, terms):
    terms.append({"concept": "الصلاة", "langs": {"tl": {"term": "ṣalāh"}, "en": {"term": "prayer"}}})
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "glossary_term", "الصلاة", "tl", note="Gamitin ang salat")
    assert [t["term"] for t in (await client.get("/api/glossary?lang=tl")).json()["terms"]] == ["wuḍū'", "zakāh"]
    assert [t["term"] for t in (await client.get("/api/glossary?lang=en")).json()["terms"]] == ["prayer"]  # other language unaffected
    terms[2]["langs"]["tl"] = {"term": "ṣalāt"}  # the corrected term is merged
    assert [t["term"] for t in (await client.get("/api/glossary?lang=tl")).json()["terms"]] == ["wuḍū'", "zakāh", "ṣalāt"]
