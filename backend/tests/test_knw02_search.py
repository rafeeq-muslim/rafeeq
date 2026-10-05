"""KNW-02 §3.6/3.8: embedding job and hybrid search (dummy passages,
deterministic embeddings, no network)."""

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.knowledge import embed
from app.knowledge.models import AiCall, Passage
from app.knowledge.search import search
from tests.knw_fakes import add_passages

EN = {
    "id": "hadeethenc:en:1",
    "lang": "en",
    "quote_text": "TEST_QUOTE_TEXT ablution before prayer",
    "context_text": "TEST_CONTEXT_TEXT washing",
}
TL = {
    "id": "hadeethenc:tl:1",
    "lang": "tl",
    "quote_text": "TEST_QUOTE_TEXT ablution before prayer",
    "context_text": "TEST_CONTEXT_TEXT washing",
}
AR = {"id": "hadeethenc:ar:1", "lang": "ar", "quote_text": "TEST_QUOTE_TEXT ablution before prayer"}

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture


async def test_knw02_r4_search_returns_only_asker_language(ai):
    await add_passages(EN, TL, AR)
    async with SessionLocal() as s:
        hits = await search(s, "ablution before prayer", "tl")
    assert [h["id"] for h in hits] == ["hadeethenc:tl:1"]
    assert hits[0]["score"] is not None and hits[0]["score"] > 0.3


async def test_knw02_search_collapses_two_translations_of_one_ayah(ai):
    a = {
        "id": "quranenc:english_saheeh:1:1",
        "kind": "quran_translation",
        "lang": "en",
        "ref_key": "1:1",
        "quote_text": "TEST_AYAH mercy name",
    }
    b = {
        "id": "quranenc:english_rwwad:1:1",
        "kind": "quran_translation",
        "lang": "en",
        "ref_key": "1:1",
        "quote_text": "TEST_AYAH mercy name of",
    }
    await add_passages(a, b)
    async with SessionLocal() as s:
        hits = await search(s, "mercy name", "en")
    assert len(hits) == 1


async def test_knw02_search_falls_back_to_fulltext_when_embedding_fails(ai):
    await add_passages(EN, embed=False)
    ai.embed_status = 503
    async with SessionLocal() as s:
        hits = await search(s, "washing before prayers", "en")  # english stemming: prayers → prayer
    assert [h["id"] for h in hits] == ["hadeethenc:en:1"]
    assert hits[0]["score"] is None


async def test_knw02_search_threshold_returns_empty_list(ai, monkeypatch):
    await add_passages(EN)
    monkeypatch.setattr(get_settings(), "knw_min_similarity", 0.9)
    async with SessionLocal() as s:
        assert await search(s, "ablution washing", "en") == []


async def test_knw02_embed_job_resumes_and_skips_embedded_rows(ai):
    await add_passages(EN, TL, embed=False)
    await add_passages(AR)  # already embedded
    first = await embed.run(limit=1, batch=1)
    assert first == {"embedded": 1, "stopped": None}
    second = await embed.run(batch=10)
    assert second == {"embedded": 1, "stopped": None}
    async with SessionLocal() as s:
        assert all(p.embedding is not None for p in await s.scalars(select(Passage)))
    sent = [t for agent, body in ai.calls if agent == "embed" for t in body["input"]]
    assert len(sent) == 2 and not any("TEST_QUOTE_TEXT ablution before prayer" == t for t in sent)  # quote + context sent
    async with SessionLocal() as s:
        calls = list(await s.scalars(select(AiCall)))
    assert len(calls) == 2 and all(c.agent == "embed" and c.cost_usd > 0 for c in calls)


async def test_knw02_embed_job_stops_at_budget(ai):
    await add_passages(EN, embed=False)
    async with SessionLocal() as s:
        s.add(AiCall(agent="test", model="test", cost_usd=get_settings().ai_budget_usd))
        await s.commit()
    assert await embed.run(batch=10) == {"embedded": 0, "stopped": "budget"}
    assert ai.calls == []
