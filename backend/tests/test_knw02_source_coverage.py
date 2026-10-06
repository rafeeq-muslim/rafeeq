"""KNW-02 source coverage PRD (docs/domains/knowledge/features/KNW-02-source-coverage-and-retrieval-prd.md):
one test per acceptance case S01–S20 that can run with fixtures, plus the
product owner's islamqa decisions of 2026-10-06 (main source, near-tie
preference, embedding ceiling). Live cases (production corpus, Recall@8 on
a reviewed set) are listed as "not run (live)" in the implementation report.

Passage texts are dummies (plan rule 6); embeddings are deterministic bags of words."""

import json
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select, update

from app.core.config import Settings, get_settings
from app.core.db import SessionLocal
from app.knowledge import embed, jobs, load, source_diagnostics, source_policy
from app.knowledge.ai import client
from app.knowledge.models import AiCall, AnswerLog, Passage, Source
from app.knowledge.search import prefer_on_near_tie, retrieve, search
from tests.knw_fakes import add_passages

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

ROUTE_GENERAL = {"route": "general", "level": "A"}
SUPPORTED = {"supported": True, "unsupported": []}
IQA = {"id": "islamqa:en:4", "kind": "fatwa", "lang": "en", "ref_key": "4", "quote_text": "TEST_QUOTE_TEXT circumcision new muslim delay"}
BBZ = {"id": "binbaz:en:9", "kind": "fatwa", "lang": "en", "ref_key": "9", "quote_text": "TEST_QUOTE_TEXT fasting traveller ruling"}
ALL = "quranenc,hadeethenc,islamhouse_enc,binbaz,islamqa"


async def post(client_, question: str, lang: str = "en"):
    r = await client_.post("/api/ask", json={"question": question, "lang": lang})
    assert r.status_code == 200, r.text
    return r.json()


async def last_trace() -> dict:
    async with SessionLocal() as s:
        return (await s.scalars(select(AnswerLog).order_by(AnswerLog.at.desc()))).first().trace


def test_knw02_owner_islamqa_is_a_default_answer_source(monkeypatch):
    monkeypatch.delenv("KNW_ANSWER_SOURCES", raising=False)
    st = Settings(_env_file=None)
    assert source_policy.parse_sources(st.knw_answer_sources) == (
        ["quranenc", "hadeethenc", "islamhouse_enc", "binbaz", "islamqa", "rafeeq_cards"],
        [],
    )
    assert st.ai_embed_daily_budget_usd == 1.0 and st.ai_budget_usd == 10.0
    assert st.knw_embed_job_limit * (60 // st.knw_embed_job_minutes) * 24 >= 96_511  # the islamqa set fits in a day of job runs


# --- SC1: one policy --------------------------------------------------------------


def test_knw02_s11_list_parsing_is_uniform_and_unknown_names_are_reported(monkeypatch):
    assert source_policy.parse_sources(" binbaz , islamqa,binbaz,, bogus ") == (["binbaz", "islamqa"], ["bogus"])
    with pytest.raises(source_policy.SourcePolicyError):
        source_policy.parse_sources("binbaz,bogus", strict=True)
    monkeypatch.setattr(get_settings(), "knw_answer_sources", " binbaz ,bogus,binbaz")
    assert source_policy.configured_sources() == ["binbaz"]  # an unknown name never widens the search
    assert source_policy.unknown_configured() == ["bogus"]


async def test_knw02_s10_empty_list_searches_nothing_none_uses_the_policy(ai):
    await add_passages(IQA, BBZ)
    async with SessionLocal() as s:
        assert await search(s, "circumcision fasting", "en", sources=[]) == []
        assert ai.calls == []  # not even an embedding
        ids = {h["id"] for h in await search(s, "circumcision fasting", "en", sources=None)}
    assert ids == {"islamqa:en:4", "binbaz:en:9"}


async def test_knw02_s01_islamqa_in_database_but_not_configured(ai, monkeypatch):
    await add_passages(IQA, BBZ)
    monkeypatch.setattr(get_settings(), "knw_answer_sources", "quranenc,hadeethenc,islamhouse_enc,binbaz")
    async with SessionLocal() as s:
        res = await retrieve(s, "circumcision new muslim", "en")
        inv = await source_diagnostics.inventory(s)
    assert all(p["source_id"] != "islamqa" for p in res.passages)
    assert res.sources["islamqa"] == {"eligible": False, "exclusion": "disabled_by_answer_config"}
    assert inv["sources"]["islamqa"]["exclusion_reason"] == "disabled_by_answer_config"
    assert inv["sources"]["islamqa"]["effective_for_answers"] is False and inv["sources"]["islamqa"]["in_database"] is True


async def test_knw02_s06_configured_source_without_data_is_missing_source(ai, monkeypatch):
    await add_passages(BBZ)
    monkeypatch.setattr(get_settings(), "knw_answer_sources", "binbaz,islamhouse")  # no `islamhouse` row in the database
    async with SessionLocal() as s:
        res = await retrieve(s, "fasting", "en")
        inv = await source_diagnostics.inventory(s)
    assert res.sources["islamhouse"]["exclusion"] == "missing_source"
    assert inv["sources"]["islamhouse"]["exclusion_reason"] == "missing_source" and inv["sources"]["islamhouse"]["in_database"] is False


async def test_knw02_s09_link_mode_source_is_never_used(client, ai, monkeypatch):
    await add_passages(IQA, BBZ)
    async with SessionLocal() as s:
        await s.execute(update(Source).where(Source.id == "islamqa").values(mode="link"))
        await s.commit()
        res = await retrieve(s, "circumcision new muslim", "en")
    assert res.sources["islamqa"]["exclusion"] == "mode_link"
    assert all(p["source_id"] != "islamqa" for p in res.passages)


async def test_knw02_s08_tagalog_request_without_islamqa_tagalog(client, ai):
    await add_passages(IQA, {"id": "hadeethenc:tl:3", "lang": "tl", "quote_text": "TEST_QUOTE_TEXT pagtutuli bagong muslim"})
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": True, "answer": "Isang pagsubok na sagot. {{q:hadeethenc:tl:3}}", "sources": ["hadeethenc:tl:3"]})
    ai.on("support", SUPPORTED)
    b = await post(client, "Ano ang pagtutuli para sa bagong muslim?", "tl")
    assert b["outcome"] == "answered" and [s["lang"] for s in b["sources"]] == ["tl"]  # never another language silently
    assert (await last_trace())["sources"]["islamqa"]["exclusion"] == "no_passages_for_lang"


# --- SC2: the loader never succeeds on missing or broken data ----------------------


def _row(i: int, sid: str = "islamqa") -> dict:
    return {
        "id": f"{sid}:en:{i}",
        "source_id": sid,
        "kind": "fatwa",
        "lang": "en",
        "ref": {"question_id": i},
        "ref_key": str(i),
        "quote_text": f"TEST_QUOTE_TEXT {i}",
        "context_text": "",
        "meta": {},
        "version": "dump-test",
        "origin_url": f"https://islamqa.info/en/answers/{i}",
        "fetched_at": "2026-10-04T00:00:00Z",
        "text_hash": f"sha256:{i}",
    }


def _write(path, rows: list[dict], extra: str = "") -> None:
    path.write_text("".join(json.dumps(r) + "\n" for r in rows) + extra, encoding="utf-8")


async def _count(sid: str = "islamqa") -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(func.count(Passage.id)).where(Passage.source_id == sid))


async def test_knw02_s12_missing_empty_broken_or_shrunk_file_never_replaces_the_corpus(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "corpus_dir", tmp_path)
    f = tmp_path / "islamqa.jsonl"
    _write(f, [_row(i) for i in range(20)])
    assert await load.main(["islamqa"]) == 0 and await _count() == 20
    # requested source without its file: a clear failure, not a silent skip
    assert await load.main(["binbaz"]) == 1
    # empty file
    _write(f, [])
    assert await load.main(["islamqa"]) == 1 and await _count() == 20
    # a broken line
    _write(f, [_row(i) for i in range(20)], extra="{not json\n")
    assert await load.main(["islamqa"]) == 1 and await _count() == 20
    # a row missing its text
    _write(f, [*(_row(i) for i in range(19)), {**_row(19), "quote_text": ""}])
    assert await load.main(["islamqa"]) == 1 and await _count() == 20
    # a large unexpected shrink (a broken download)
    _write(f, [_row(i) for i in range(10)])
    assert await load.main(["islamqa"]) == 1 and await _count() == 20
    # a manifest that does not match
    (tmp_path / "islamqa.manifest.json").write_text(json.dumps({"rows": 25, "complete": True}))
    _write(f, [_row(i) for i in range(20)])
    assert await load.main(["islamqa"]) == 1 and await _count() == 20
    (tmp_path / "islamqa.manifest.json").write_text(json.dumps({"rows": 20, "complete": True}))
    assert await load.main(["islamqa"]) == 0
    # an intended removal is explicit
    (tmp_path / "islamqa.manifest.json").unlink()
    _write(f, [_row(i) for i in range(10)])
    assert await load.main(["islamqa"], allow_shrink=True) == 0 and await _count() == 10


async def test_knw02_sc2_reload_keeps_the_embedding_record(tmp_path, monkeypatch, ai):
    monkeypatch.setattr(get_settings(), "corpus_dir", tmp_path)
    _write(tmp_path / "islamqa.jsonl", [_row(i) for i in range(3)])
    await load.main(["islamqa"])
    result = await embed.run(sources=["islamqa"], batch=10)
    await embed.record_coverage(["islamqa"], result)
    await load.main(["islamqa"])
    async with SessionLocal() as s:
        v = (await s.get(Source, "islamqa")).versions
    assert v["count"] == 3 and v["complete"] is True and v["embedding"]["ready"] is True


# --- SC3: embeddings for the second source -----------------------------------------


async def test_knw02_s13_embedding_ceiling_stops_safely_and_reports_what_remains(ai):
    await add_passages(IQA, BBZ, embed=False)
    async with SessionLocal() as s:
        s.add(AiCall(agent="embed", model="test", cost_usd=get_settings().ai_embed_daily_budget_usd, at=datetime.now(UTC)))
        await s.commit()
    result = await embed.run(sources=["islamqa", "binbaz"], batch=10)
    assert result == {"embedded": 0, "stopped": "budget"} and ai.calls == []
    await embed.record_coverage(["islamqa", "binbaz"], result)
    async with SessionLocal() as s:
        rec = (await s.get(Source, "islamqa")).versions["embedding"]
    assert rec["ready"] is False and rec["remaining"] == 1 and rec["stopped"] == "budget"
    # answers have their own daily ceiling: the router still runs
    await client.guard("router")


async def test_knw02_sc3_answer_ceiling_does_not_stop_the_embedding_job(ai):
    await add_passages(IQA, embed=False)
    async with SessionLocal() as s:
        s.add(AiCall(agent="router", model="test", cost_usd=get_settings().ai_daily_budget_usd))
        await s.commit()
    assert (await embed.run(sources=["islamqa"], batch=10)) == {"embedded": 1, "stopped": None}


async def test_knw02_sc3_job_uses_the_policy_and_records_coverage(ai, monkeypatch):
    await add_passages(IQA, BBZ, {**BBZ, "id": "hadeethenc:en:1"}, embed=False)
    monkeypatch.setattr(get_settings(), "knw_answer_sources", " islamqa , binbaz,islamqa")  # spaces and a repeat
    async with SessionLocal() as s:
        await s.execute(update(Source).where(Source.id == "binbaz").values(mode="link"))
        await s.commit()
    await jobs.embed_batch()
    async with SessionLocal() as s:
        embedded = set(await s.scalars(select(Passage.id).where(Passage.embedding.is_not(None))))
        rec = (await s.get(Source, "islamqa")).versions["embedding"]
    assert embedded == {"islamqa:en:4"}  # binbaz is link-only now, hadeethenc not configured
    assert rec["langs"]["en"] == {"passages": 1, "embedded": 1, "remaining": 0, "pct": 100.0} and rec["ready"] is True


async def test_knw02_s19_other_model_vectors_are_never_mixed(ai):
    await add_passages(BBZ)
    async with SessionLocal() as s:
        await s.execute(update(Source).where(Source.id == "binbaz").values(versions={"embedding": {"model": "test/old-model"}}))
        await s.commit()
        res = await retrieve(s, "fasting traveller", "en")
    assert res.sources["binbaz"]["vector_note"] == "embedding_model_mismatch" and res.vector_count == 0
    assert [p["id"] for p in res.passages] == ["binbaz:en:9"]  # still found by its words
    await add_passages({**BBZ, "id": "binbaz:en:10"}, embed=False)
    assert await embed.run(sources=["binbaz"]) == {"embedded": 0, "stopped": "model_mismatch"}


# --- SC4: selection by quality, owner's near-tie preference ------------------------


async def test_knw02_owner_near_tie_prefers_islamqa(ai, monkeypatch):
    # PRD live v3 §1/§7.2 (A25): no site is preferred by default; the near-tie
    # mechanism applies only when KNW_PREFERRED_SOURCE is set explicitly.
    monkeypatch.setattr(get_settings(), "knw_preferred_source", "islamqa")
    same = "TEST_QUOTE_TEXT zakat gold threshold"
    await add_passages({**IQA, "quote_text": same}, {**BBZ, "quote_text": same})
    async with SessionLocal() as s:
        res = await retrieve(s, "zakat gold threshold", "en")
    assert [p["source_id"] for p in res.passages][:2] == ["islamqa", "binbaz"]
    cand = {c["source_id"]: c["rrf"] for c in res.candidates}
    assert abs(cand["binbaz"] - cand["islamqa"]) <= get_settings().knw_near_tie_epsilon


async def test_knw_live_a25_no_site_preference_by_default(ai):
    assert get_settings().knw_preferred_source == ""
    same = "TEST_QUOTE_TEXT zakat gold threshold"
    await add_passages({**IQA, "quote_text": same}, {**BBZ, "quote_text": same})
    async with SessionLocal() as s:
        res = await retrieve(s, "zakat gold threshold", "en")
    assert [p["source_id"] for p in res.passages][:2] == ["binbaz", "islamqa"]  # fixed id tie-break only


async def test_knw02_owner_near_tie_off_keeps_the_plain_order(ai, monkeypatch):
    monkeypatch.setattr(get_settings(), "knw_near_tie_epsilon", 0.0)
    same = "TEST_QUOTE_TEXT zakat gold threshold"
    await add_passages({**IQA, "quote_text": same}, {**BBZ, "quote_text": same})
    async with SessionLocal() as s:
        res = await retrieve(s, "zakat gold threshold", "en")
    assert [p["source_id"] for p in res.passages][:2] == ["binbaz", "islamqa"]  # id tie-break only


async def test_knw02_owner_clearly_better_binbaz_stays_first(ai):
    await add_passages(
        {**BBZ, "quote_text": "TEST_QUOTE_TEXT zakat gold threshold nisab"},
        {**IQA, "quote_text": "TEST_QUOTE_TEXT zakat camels"},
    )
    async with SessionLocal() as s:
        res = await retrieve(s, "zakat gold threshold nisab", "en")
    assert res.passages[0]["source_id"] == "binbaz"


async def test_knw02_owner_irrelevant_islamqa_is_not_put_in_context(ai):
    await add_passages(
        {**BBZ, "quote_text": "TEST_QUOTE_TEXT zakat gold threshold"},
        {**BBZ, "id": "binbaz:en:10", "ref_key": "10", "quote_text": "TEST_QUOTE_TEXT zakat gold nisab"},
        {**IQA, "quote_text": "TEST_QUOTE_TEXT wedding dowry"},
    )
    async with SessionLocal() as s:
        res = await retrieve(s, "zakat gold threshold", "en", k=2)
    assert [p["source_id"] for p in res.passages] == ["binbaz", "binbaz"]


def test_knw02_owner_near_tie_never_passes_a_clearly_better_or_another_preferred_candidate():
    score = {"b1": 0.0330, "q1": 0.0328, "b2": 0.0300, "q2": 0.0299, "q3": 0.0200}
    src = {"b1": "binbaz", "q1": "islamqa", "b2": "binbaz", "q2": "islamqa", "q3": "islamqa"}
    order = ["b1", "q1", "b2", "q2", "q3"]
    assert prefer_on_near_tie(order, score, src, "islamqa", 0.0003) == ["q1", "b1", "q2", "b2", "q3"]
    assert prefer_on_near_tie(order, score, src, "islamqa", 0.0) == order


async def test_knw02_s02_islamqa_exclusive_evidence_reaches_the_answer(client, ai):
    await add_passages(IQA, BBZ)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": True, "answer": "A new Muslim may delay it. {{q:islamqa:en:4}}", "sources": ["islamqa:en:4"]})
    ai.on("support", SUPPORTED)
    b = await post(client, "Must a new muslim do circumcision before entering Islam?")
    assert b["outcome"] == "answered" and [s["source_id"] for s in b["sources"]] == ["islamqa"]
    composer = next(body for agent, body in ai.calls if agent == "composer")
    assert "[islamqa:en:4]" in composer["messages"][1]["content"]


async def test_knw02_s03_binbaz_exclusive_evidence_still_answers(client, ai):
    await add_passages(IQA, BBZ)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": True, "answer": "A traveller may break the fast. {{q:binbaz:en:9}}", "sources": ["binbaz:en:9"]})
    ai.on("support", SUPPORTED)
    b = await post(client, "Can a traveller break the fasting?")
    assert b["outcome"] == "answered" and [s["source_id"] for s in b["sources"]] == ["binbaz"]


async def test_knw02_s04_s15_evidence_in_one_source_no_padding_and_not_cited_is_traced(client, ai):
    await add_passages(IQA, BBZ)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": True, "answer": "A new Muslim may delay it. {{q:islamqa:en:4}}", "sources": ["islamqa:en:4"]})
    ai.on("support", SUPPORTED)
    b = await post(client, "circumcision new muslim delay fasting")
    assert {s["source_id"] for s in b["sources"]} == {"islamqa"}  # no card for a source the answer did not use
    t = (await last_trace())["sources"]
    assert t["islamqa"]["cited"] == 1 and t["islamqa"]["verified"] == 1
    assert t["binbaz"]["context"] >= 1 and t["binbaz"]["cited"] == 0 and t["binbaz"]["exclusion"] == "not_cited"


async def test_knw02_s05_both_sources_relevant_both_reported(ai, tmp_path):
    await add_passages({**IQA, "quote_text": "TEST_QUOTE_TEXT fasting traveller islamqa view"}, BBZ)
    async with SessionLocal() as s:
        t = await source_diagnostics.trace(s, "fasting traveller", "en")
    assert {c["source_id"] for c in t["candidates"] if c["selected_for_context"]} == {"islamqa", "binbaz"}
    assert all(
        set(c) >= {"passage_id", "ref_key", "retrieval_channel", "rank", "similarity", "rrf", "exclusion_reason"} for c in t["candidates"]
    )
    assert "fasting traveller" not in json.dumps(t)  # no question text in the report


async def test_knw02_s07_islamqa_without_vectors_uses_full_text_and_full_checks(client, ai):
    await add_passages(BBZ)
    await add_passages(IQA, embed=False)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": True, "answer": "A new Muslim may delay it. {{q:islamqa:en:4}}", "sources": ["islamqa:en:4"]})
    ai.on("support", SUPPORTED)
    b = await post(client, "circumcision for a new muslim")
    assert b["outcome"] == "answered" and "support" in ai.agents_called()
    assert (await last_trace())["sources"]["islamqa"]["vector_note"] == "embedding_pending"


async def test_knw02_s14_crowding_is_measured_not_reranked(ai):
    crowd = [{**BBZ, "id": f"binbaz:en:9:{i}", "quote_text": f"TEST_QUOTE_TEXT fasting traveller part {i}"} for i in range(9)]
    other = {"id": "hadeethenc:en:5", "lang": "en", "quote_text": "TEST_QUOTE_TEXT traveller"}
    await add_passages(*crowd, other)
    async with SessionLocal() as s:
        t = await source_diagnostics.trace(s, "fasting traveller", "en", expected=["hadeethenc:en:5"])
    assert t["per_source"]["hadeethenc"]["exclusion"] == "context_limit"  # visible, for the ranking decision
    assert t["recall_at_k"] == 0.0


async def test_knw02_s16_islamqa_card_names_the_site_it_came_from(client, ai):
    quoting = {**IQA, "quote_text": "TEST_QUOTE_TEXT circumcision; Shaykh Ibn Baz said it may be delayed"}
    await add_passages(quoting)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": True, "answer": "It may be delayed. {{q:islamqa:en:4}}", "sources": ["islamqa:en:4"]})
    ai.on("support", SUPPORTED)
    b = await post(client, "Can circumcision be delayed?")
    (card,) = b["sources"]
    assert (card["source_id"], card["source_name"]) == ("islamqa", "الإسلام سؤال وجواب")
    assert card["origin_url"].startswith("https://example.test/islamqa")  # the passage's own link, never binbaz.org.sa


def test_knw02_s17_environment_value_overrides_the_default(monkeypatch):
    monkeypatch.setenv("KNW_ANSWER_SOURCES", "quranenc,binbaz")
    assert Settings(_env_file=None).knw_answer_sources == "quranenc,binbaz"  # an older override wins: read the live value


async def test_knw02_s18_index_failure_is_a_technical_failure(ai, monkeypatch):
    from app.knowledge import search as search_mod

    await add_passages(IQA, BBZ)
    monkeypatch.setattr(search_mod, "tsquery", lambda q, lang: "fasting & & |")
    async with SessionLocal() as s:
        res = await retrieve(s, "fasting traveller", "en")
    assert res.status == "degraded" and res.reason == "retrieval_db_error"  # vectors still answer; never "no knowledge"


async def test_knw02_s20_rollback_keeps_service_and_data(client, ai, monkeypatch):
    await add_passages(IQA, BBZ)
    monkeypatch.setattr(get_settings(), "knw_near_tie_epsilon", 0.0)
    monkeypatch.setattr(get_settings(), "knw_answer_sources", "quranenc,hadeethenc,islamhouse_enc,binbaz")
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": True, "answer": "A traveller may break the fast. {{q:binbaz:en:9}}", "sources": ["binbaz:en:9"]})
    ai.on("support", SUPPORTED)
    assert (await post(client, "Can a traveller break the fasting?"))["outcome"] == "answered"
    assert await _count("islamqa") == 1  # nothing deleted to roll back


async def test_knw02_inventory_reports_readiness_per_language(ai):
    await add_passages(BBZ)
    await add_passages(IQA, {**IQA, "id": "islamqa:ar:4", "lang": "ar"}, embed=False)
    async with SessionLocal() as s:
        inv = await source_diagnostics.inventory(s)
    iq = inv["sources"]["islamqa"]
    assert iq["configured_for_answers"] and iq["effective_for_answers"] and iq["index_mode"] == "index"
    assert iq["available_languages"] == {"ar": {"passages": 1, "embedded": 0, "pct": 0.0}, "en": {"passages": 1, "embedded": 0, "pct": 0.0}}
    assert iq["notes"] == {"ar": "embedding_pending", "en": "embedding_pending"}
    assert "islamqa" in inv["answer_sources"]
