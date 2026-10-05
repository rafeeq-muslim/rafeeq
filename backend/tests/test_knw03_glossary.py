"""KNW-03 unified glossary (approved-term service): one test per example built."""

import pytest

from app.knowledge import glossary
from tests.test_knw07_daily import approve, with_roles


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


async def test_knw03_r1_approved_term_with_definition_and_source(client, terms):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await approve(client, reviewer, "glossary_term", "الوضوء", "tl")
    [t] = (await client.get("/api/glossary?lang=tl")).json()["terms"]
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


async def test_knw03_r2_proposed_term_is_not_served(client, terms):
    # «الزكاة» is proposed in Tagalog but not approved: it is never served (nor machine-translated, R5).
    assert (await client.get("/api/glossary?lang=tl")).json()["terms"] == []
    assert (await client.get("/api/glossary?lang=en")).json()["terms"] == []
