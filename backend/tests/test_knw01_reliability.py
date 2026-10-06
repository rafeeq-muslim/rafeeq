"""KNW-01 reliability PRD (docs/domains/knowledge/features/KNW-01-chatbot-reliability-prd.md):
one test per acceptance case T01–T32 that can run with fakes. The app side
of T01, T14, T15, T17, T18, T27 and T31 is in frontend/src/app/ask/store.test.ts
and frontend/src/app/pages/Ask.test.tsx. Live cases (real models, production
corpus) are listed as "not run (live)" in the implementation report.

Model calls are answered by scripted OpenRouter envelopes (tests/knw_fakes.py);
passage texts are dummies (plan rule 6)."""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings, get_settings
from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.knowledge import approved, ask, query_normalization, search, tasks
from app.knowledge.ai import agents, screen
from app.knowledge.ai.errors import DeadlineExceeded
from app.knowledge.models import AiCall, AnswerLog, Passage
from tests.knw_fakes import add_passages

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

ROUTE_GENERAL = {"route": "general", "level": "A"}
SUPPORTED = {"supported": True, "unsupported": []}
SHAHADA_EN = {
    "id": "hadeethenc:en:101",
    "lang": "en",
    "quote_text": "TEST_QUOTE_TEXT la ilaha illa allah",
    "context_text": "TEST_CONTEXT_TEXT meaning of the shahada none deserves worship",
}
SHAHADA_EN_2 = {
    "id": "hadeethenc:en:102",
    "lang": "en",
    "quote_text": "TEST_QUOTE_TEXT shahada testimony",
    "context_text": "TEST_CONTEXT_TEXT the two testimonies explained for new muslims",
}
SHAHADA_AR = {
    "id": "binbaz:ar:6940:1",
    "kind": "fatwa",
    "lang": "ar",
    "ref_key": "6940",
    "quote_text": "TEST_QUOTE_TEXT شرح معنى الشهادتين للمسلم الجديد",
    "context_text": "TEST_CONTEXT_TEXT معنى الشهادتين",
}
SHAHADA_AR_2 = {
    "id": "binbaz:ar:6940:2",
    "kind": "fatwa",
    "lang": "ar",
    "ref_key": "6940",
    "quote_text": "TEST_QUOTE_TEXT تتمة شرح الشهادتين",
}
WUDU_AR = {"id": "hadeethenc:ar:7", "lang": "ar", "quote_text": "TEST_QUOTE_TEXT فضل الوضوء وثوابه"}
Q_EN = "What does la ilaha illa allah mean?"
GOOD_EN = {"sufficient": True, "answer": "Nothing deserves worship except Allah. {{q:hadeethenc:en:101}}", "sources": ["hadeethenc:en:101"]}


async def post(client, question: str, lang: str = "en", status: int = 200, **extra):
    r = await client.post("/api/ask", json={"question": question, "lang": lang, **extra})
    assert r.status_code == status, r.text
    return r.json()


async def outbox() -> list[OutboxEvent]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(OutboxEvent)))


async def log_rows() -> list[AnswerLog]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(AnswerLog).order_by(AnswerLog.at)))


def user_msg(body: dict) -> str:
    return body["messages"][1]["content"]


def passages_part(body: dict) -> str:
    return user_msg(body).split("PASSAGES:", 1)[1]


def bodies(ai, agent: str) -> list[dict]:
    return [b for a, b in ai.calls if a == agent]


# --- Phase 1: outcomes apart from failures, tracing ----------------------------------


async def test_knw01_t11_verifier_down_is_unavailable(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", GOOD_EN)
    ai.on("support", 503, 503)  # main and fallback verifier down
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable" and b["reason_code"] == "temporarily_unavailable" and b["retryable"] is True
    assert b["sources"] == [] and "Nothing deserves" not in b["answer"]  # never the unverified text
    assert b["answer"] == screen.fixed("unavailable", "en")
    (row,) = await log_rows()
    assert row.detail == "verifier_unavailable" and row.ask_id == b["ask_id"]


async def test_knw01_t11_verifier_timeout_is_unavailable(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", GOOD_EN)

    async def times_out(*a, **k):
        raise DeadlineExceeded("deadline_exceeded")

    monkeypatch.setattr(agents, "support_check", times_out)
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable" and b["reason_code"] == "deadline_exceeded" and b["sources"] == []


async def test_knw01_t08_healthy_empty_retrieval_is_no_source(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    b = await post(client, "Ano ang kahulugan ng shahada?", "tl")  # no Tagalog passage at all
    assert b["outcome"] == "no_source" and b["reason_code"] == "retrieval_empty" and b["retryable"] is False
    assert "composer" not in ai.agents_called() and b["sources"] == []


async def test_knw01_t22_logs_link_stages_by_ask_id_without_text(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", GOOD_EN)
    ai.on("support", SUPPORTED)
    b = await post(client, Q_EN, entrypoint="suggestion", suggestion_id="shahada_meaning", client_request_id="req-12345678")
    assert b["outcome"] == "answered"
    (row,) = await log_rows()
    async with SessionLocal() as s:
        calls = list(await s.scalars(select(AiCall)))
    assert row.ask_id == b["ask_id"] and {c.ask_id for c in calls} == {b["ask_id"]}
    assert (row.entrypoint, row.suggestion_id, row.client_request_id) == ("suggestion", "shahada_meaning", "req-12345678")
    assert [st["stage"] for st in row.trace["stages"]] == ["screen", "route", "retrieval", "compose", "verify"]
    dumped = json.dumps([row.trace, row.detail, row.reason_code], ensure_ascii=False)
    for secret in (Q_EN, "Nothing deserves", "TEST_QUOTE_TEXT", "TEST_CONTEXT_TEXT"):
        assert secret not in dumped
    for e in await outbox():
        assert Q_EN not in json.dumps(e.payload)
    assert {c.name for c in AiCall.__table__.columns} >= {"ask_id"}
    assert not any(c.name in ("prompt", "question", "answer", "text") for c in AiCall.__table__.columns)


# --- Phase 2: one submission contract, deadlines, HTTP errors -------------------


async def test_knw01_t01_suggestion_and_typed_reach_the_pipeline_identically(client, ai):
    await add_passages(SHAHADA_EN)
    ai.always("router", ROUTE_GENERAL)
    ai.always("composer", GOOD_EN)
    ai.always("support", SUPPORTED)
    typed = await post(client, "What does the shahada mean?", entrypoint="typed")
    clicked = await post(client, "What does the shahada mean?", entrypoint="suggestion", suggestion_id="shahada_meaning")
    assert typed["outcome"] == clicked["outcome"] == "answered"
    routers, composers = bodies(ai, "router"), bodies(ai, "composer")
    assert len(routers) == 2 and user_msg(routers[0]) == user_msg(routers[1])
    assert len(composers) == 2 and user_msg(composers[0]) == user_msg(composers[1])
    assert [s["id"] for s in typed["sources"]] == [s["id"] for s in clicked["sources"]]


@pytest.mark.parametrize(
    ("lang", "question"),
    [
        ("ar", "ما فضل الوضوء؟"),
        ("en", "What is the reward of wudu?"),
        ("tl", "Ano ang gantimpala ng wudhu?"),
        ("ar", "كيف أعامل والديّ؟"),
        ("en", "How should I treat my parents?"),
        ("tl", "Paano ko dapat pakitunguhan ang aking mga magulang?"),
    ],
)
async def test_knw01_t02_suggestions_send_their_text_and_language(client, ai, lang, question):
    pid = f"hadeethenc:{lang}:5"
    await add_passages({"id": pid, "lang": lang, "quote_text": f"TEST_QUOTE_TEXT {question}"})
    ai.on("router", ROUTE_GENERAL)
    answer = {"ar": "نص تجريبي من المصدر.", "en": "A test answer from the source.", "tl": "Isang pagsubok na sagot mula sa sanggunian."}[
        lang
    ]
    ai.on("composer", {"sufficient": True, "answer": f"{answer} {{{{q:{pid}}}}}", "sources": [pid]})
    ai.on("support", SUPPORTED)
    b = await post(client, question, lang, entrypoint="suggestion", suggestion_id="wudu_virtue")
    assert b["outcome"] == "answered" and b["lang"] == lang and [s["id"] for s in b["sources"]] == [pid]
    assert question in user_msg(bodies(ai, "router")[0])  # the shown text, unchanged


@pytest.mark.parametrize(
    ("lang", "question"), [("ar", "ماذا أتعلّم الآن؟"), ("en", "What should I learn now?"), ("tl", "Ano ang dapat kong pag-aralan ngayon?")]
)
async def test_knw01_t03_what_next_is_the_learning_guide_by_click_or_typing(client, ai, lang, question):
    for entry in ("typed", "suggestion"):
        b = await post(client, question, lang, entrypoint=entry)
        assert b["outcome"] == "learning_guide"
    assert ai.calls == []  # no model; the app builds the guide or its fixed message


@pytest.mark.parametrize(
    "body",
    [
        {"question": " a ", "lang": "en"},  # 1 character after trim
        {"question": "x" * 601, "lang": "en"},
        {"question": "What is wudu?", "lang": "fr"},
        {"question": "What is wudu?", "lang": "en", "entrypoint": "banner"},
        {"question": "What is wudu?", "lang": "en", "suggestion_id": "Not An Id!"},
        {"question": "What is wudu?", "lang": "en", "client_request_id": "short"},
    ],
)
async def test_knw01_t15_invalid_request_is_422_not_a_network_error(client, ai, body):
    r = await client.post("/api/ask", json=body)
    assert r.status_code == 422 and ai.calls == []


async def test_knw01_t15_rate_limit_is_429(client, ai):
    for _ in range(8):
        await post(client, "They beat me at home")
    r = await client.post("/api/ask", json={"question": "They beat me at home", "lang": "en"})
    assert r.status_code == 429 and r.json()["detail"] == "rate_limited"


async def test_knw01_t15_unexpected_error_is_500_with_safe_code(client, ai, monkeypatch):
    async def broken(*a, **k):
        raise RuntimeError("TEST_SECRET_DETAIL")

    monkeypatch.setattr(ask, "_pipeline", broken)
    r = await client.post("/api/ask", json={"question": Q_EN, "lang": "en"})
    assert r.status_code == 500 and r.json() == {"detail": "internal_error"}
    (row,) = await log_rows()
    assert row.outcome == "error" and row.detail == "internal_error"


async def test_knw01_t14_server_deadline_ends_with_clear_failure(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    monkeypatch.setattr(get_settings(), "ask_deadline_seconds", 0.6)

    async def slow(*a, **k):
        await asyncio.sleep(5)

    monkeypatch.setattr(agents, "compose_answer", slow)
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable" and b["reason_code"] == "deadline_exceeded" and b["retryable"] is True
    assert b["sources"] == []


async def test_knw01_t14_time_for_the_verifier_is_reserved_before_composing(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    monkeypatch.setattr(get_settings(), "ask_deadline_seconds", 10.0)  # < verify reserve + minimum composition
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable" and b["reason_code"] == "deadline_exceeded"
    assert "composer" not in ai.agents_called()  # never started a composition it could not verify


# --- Phase 3: search-only normalization, cache, text channel, tie-break -----------


async def test_knw01_t04_photo_forms_retrieve_the_same_evidence(client, ai, monkeypatch):
    monkeypatch.setattr(get_settings(), "ask_query_normalization_enabled", True)
    await add_passages(SHAHADA_AR, WUDU_AR, {"id": "hadeethenc:ar:9", "lang": "ar", "quote_text": "TEST_QUOTE_TEXT معنى كلمة أخرى"})
    ai.always("router", ROUTE_GENERAL)
    ai.always("composer", {"sufficient": True, "answer": "نص تجريبي عن الشهادتين. {{q:binbaz:ar:6940:1}}", "sources": ["binbaz:ar:6940:1"]})
    ai.always("support", SUPPORTED)
    forms = ["ما معنى الشهادتين؟", "ما معنى الشهادتين", "مامعنى الشهادتين", "مَا  مَعْنَى   الشَّهَادَتَيْنِ ؟"]
    for i, q in enumerate(forms):
        async with SessionLocal() as s:
            r = await ask.answer(s, q, "ar")
        assert r.body["outcome"] == "answered", (q, r.trace)
        ai.replies.clear()
        assert i == 0 or passages_part(bodies(ai, "composer")[i]) == passages_part(bodies(ai, "composer")[0])
    assert [a for a in ai.agents_called() if a == "embed"] == ["embed"]  # one embedding: one canonical form
    # the model still sees the question as asked
    assert "مامعنى الشهادتين" in user_msg(bodies(ai, "router")[2])


def test_knw01_t05_malik_negation_and_personal_details_are_kept():
    c = query_normalization.canonical
    assert c("مالك لا تصلي؟") == "مالك لا تصلي"  # «مالك» is never split
    assert c("ماهر في الصلاة") == "ماهر في الصلاة"
    assert c("مامعنى الشهادتين") == "ما معنى الشهادتين"
    assert c("ما معنى مامعنى") == "ما معنى مامعنى"  # the rule applies to the first word only
    assert c("هل يجوز ذلك") != c("هل لا يجوز ذلك")  # «لا» stays
    assert "not" in c("Is it not allowed?").split()
    personal = "زوجي لا يصلي وأنا أخاف على أولادي، ما معنى الشهادتين لنا؟"
    assert {"زوجي", "لا", "أخاف", "أولادي"} <= set(c(personal).split())


async def test_knw01_t05_negated_question_gets_its_own_embedding(ai, monkeypatch):
    monkeypatch.setattr(get_settings(), "ask_query_normalization_enabled", True)
    for q in ("Is music allowed?", "Is music not allowed?"):
        forms = query_normalization.build(q, "en")
        await search.embed_query(forms.canonical, "en", forms.version)
    sent = [b["input"][0] for a, b in ai.calls if a == "embed"]
    assert sent == ["Is music allowed", "Is music not allowed"]


async def test_knw01_t05_personal_question_never_matches_a_general_approved_answer(ai, monkeypatch):
    from app.knowledge import approved

    general = "What does the shahada mean"
    assert approved.matches("what does the shahada mean?", general, exact_only=True)
    assert not approved.matches("What does the shahada mean for my husband", general, exact_only=False)
    assert not approved.matches("What does the shahada not mean", general, exact_only=False)
    assert not approved.matches("what does shahada mean", general, exact_only=True)  # router down: exact only


async def test_knw01_t07_cache_key_is_exactly_the_embedded_text(ai, monkeypatch):
    monkeypatch.setattr(get_settings(), "ask_query_normalization_enabled", True)
    for q in ("مامعنى الشهادتين", "ما معنى الشهادتين؟"):  # reverse arrival order of the photo forms
        f = query_normalization.build(q, "ar")
        vec, status, _ = await search.embed_query(f.canonical, "ar", f.version)
        assert vec is not None
    embeds = [b["input"] for a, b in ai.calls if a == "embed"]
    assert embeds == [["ما معنى الشهادتين"]]  # one call; the vector of exactly the key's text
    # a different normalization version or model never reuses it
    await search.embed_query("ما معنى الشهادتين", "ar", "qn0")
    monkeypatch.setattr(get_settings(), "ai_embedding_model", "test/other-model")
    _, status, _ = await search.embed_query("ما معنى الشهادتين", "ar", query_normalization.VERSION)
    assert status == "computed" and len([a for a in ai.agents_called() if a == "embed"]) == 3


async def test_knw01_t07_normalization_off_embeds_the_raw_text(ai, monkeypatch):
    monkeypatch.setattr(get_settings(), "ask_query_normalization_enabled", False)
    f = query_normalization.build("مامعنى الشهادتين؟", "ar")
    assert (f.canonical, f.version, f.variants) == ("مامعنى الشهادتين؟", "off", [])
    await search.embed_query(f.canonical, "ar", f.version)
    assert [b["input"] for a, b in ai.calls if a == "embed"] == [["مامعنى الشهادتين؟"]]


async def test_knw01_t09_embeddings_down_text_channel_then_full_verification(client, ai):
    await add_passages(SHAHADA_EN)  # vectors exist; the embedding service is down
    ai.embed_status = 503
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", GOOD_EN)
    ai.on("support", SUPPORTED)
    b = await post(client, Q_EN)
    assert b["outcome"] == "answered" and "support" in ai.agents_called()  # verified as usual
    (row,) = await log_rows()
    ret = next(st for st in row.trace["stages"] if st["stage"] == "retrieval")
    assert (ret["status"], ret["channel"], ret.get("reason")) == ("degraded", "text_only", "embedding_unavailable")


async def test_knw01_t10_threshold_checks_text_before_refusing_and_word_match_is_not_proof(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    monkeypatch.setattr(get_settings(), "knw_min_similarity", 0.99)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": False, "answer": "", "sources": []})  # the word match is not evidence
    b = await post(client, "Is shahada a word in a football chant?")
    assert bodies(ai, "composer"), "the full-text candidate was checked"
    assert b["outcome"] == "no_source" and b["reason_code"] == "insufficient_evidence"


async def test_knw01_r3_equal_scores_break_ties_by_id(ai):
    a = {"id": "hadeethenc:en:2", "lang": "en", "quote_text": "TEST_QUOTE_TEXT fasting"}
    b = {"id": "hadeethenc:en:1", "lang": "en", "quote_text": "TEST_QUOTE_TEXT fasting"}
    await add_passages(a, b)
    async with SessionLocal() as s:
        cold = [h["id"] for h in await search.search(s, "fasting", "en")]
        warm = [h["id"] for h in await search.search(s, "fasting", "en")]
    assert cold == warm == ["hadeethenc:en:1", "hadeethenc:en:2"]


async def test_knw01_t06_same_question_twenty_times_with_fixed_data(ai):
    await add_passages(SHAHADA_EN)
    ai.always("router", ROUTE_GENERAL)
    ai.always("composer", GOOD_EN)
    ai.always("support", SUPPORTED)
    outcomes = []
    for _ in range(20):
        async with SessionLocal() as s:
            outcomes.append((await ask.answer(s, Q_EN, "en")).body["outcome"])
    assert outcomes == ["answered"] * 20
    assert [a for a in ai.agents_called() if a == "embed"] == ["embed"]  # warm cache after the first


async def test_knw01_t23_sql_error_is_a_failure_and_the_session_survives(ai, monkeypatch):
    await add_passages(SHAHADA_EN, embed=False)
    ai.embed_status = 503
    monkeypatch.setattr(search, "tsquery", lambda q, lang: "shahada & & |")  # malformed: a real SQL error
    async with SessionLocal() as s:
        res = await search.retrieve(s, "shahada", "en")
        assert (res.status, res.reason, res.passages) == ("unavailable", "retrieval_db_error", [])
        assert await s.scalar(select(func.count(Passage.id))) == 1  # usable after the rollback


async def test_knw01_t23_sql_error_answer_is_unavailable_while_clean_empty_is_no_source(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN, embed=False)
    ai.embed_status = 503
    ai.always("router", ROUTE_GENERAL)
    real = search.tsquery
    monkeypatch.setattr(search, "tsquery", lambda q, lang: "shahada & & |")
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable" and b["retryable"] is True
    monkeypatch.setattr(search, "tsquery", real)
    ai.embed_status = None
    clean = await post(client, "Who won the football cup?")
    assert clean["outcome"] == "no_source" and clean["reason_code"] == "retrieval_empty"


# --- Phase 4: shared budget, bounded repair, approved answers, cards -------------


async def test_knw01_t12_wrong_language_is_repaired_once_then_fully_checked(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on(
        "composer", {"sufficient": True, "answer": "معناها لا معبود بحق إلا الله {{q:hadeethenc:en:101}}", "sources": ["hadeethenc:en:101"]}
    )
    ai.on("composer", GOOD_EN)
    ai.on("support", SUPPORTED)
    b = await post(client, Q_EN)
    assert b["outcome"] == "answered" and b["answer"] == GOOD_EN["answer"]
    first, repair = bodies(ai, "composer")
    assert "REPAIR:" not in user_msg(first) and "REPAIR:" in user_msg(repair)
    assert "Arabic letters" in user_msg(repair) and passages_part(first).split("REPAIR:")[0] in user_msg(repair)
    assert ai.agents_called().count("support") == 1  # the rejected text was never sent to the checker


async def test_knw01_t12_marker_not_fixed_is_refused_safely(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    bad = {"sufficient": True, "answer": "Nothing deserves worship but Allah. {{hadeethenc:en:101}}", "sources": ["hadeethenc:en:101"]}
    worse = {**bad, "answer": "Nothing at all deserves worship but Allah. {{hadeethenc:en:101}}"}
    ai.on("composer", bad, worse)
    b = await post(client, Q_EN)
    assert b["outcome"] == "verification_failed" and b["sources"] == [] and "{{" not in b["answer"]
    assert ai.agents_called().count("composer") == 2  # one repair only


async def test_knw01_t13_unsupported_sentence_removed_by_repair_passes_every_check(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    extra = {**GOOD_EN, "answer": GOOD_EN["answer"] + " It must be said 70 times a day."}
    ai.on("composer", extra, GOOD_EN)
    ai.on("support", {"supported": False, "unsupported": ["It must be said 70 times a day."]}, SUPPORTED)
    b = await post(client, Q_EN)
    assert b["outcome"] == "answered" and "70 times" not in b["answer"]
    repair = bodies(ai, "composer")[1]
    assert "UNSUPPORTED SENTENCES" in user_msg(repair) and "70 times" in user_msg(repair)
    assert ai.agents_called().count("support") == 2  # the repaired text was checked again in full


async def test_knw01_t13_unchanged_repair_is_never_rechecked(client, ai):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    extra = {**GOOD_EN, "answer": GOOD_EN["answer"] + " It must be said 70 times a day."}
    ai.on("composer", extra, extra)
    ai.on("support", {"supported": False, "unsupported": ["It must be said 70 times a day."]}, SUPPORTED)
    b = await post(client, Q_EN)
    assert b["outcome"] == "verification_failed" and "70 times" not in b["answer"]
    assert ai.agents_called().count("support") == 1  # no second chance for the same text
    (row,) = await log_rows()
    assert "repair_unchanged" in row.trace["stages"][-1]["codes"]


async def test_knw01_t13_repair_off_refuses_without_retry(client, ai, monkeypatch):
    monkeypatch.setattr(get_settings(), "ask_repair_enabled", False)
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {**GOOD_EN, "answer": "Nothing deserves worship. {{q:hadeethenc:en:999}}", "sources": ["hadeethenc:en:999"]})
    b = await post(client, Q_EN)
    assert b["outcome"] == "verification_failed" and ai.agents_called().count("composer") == 1


async def test_knw01_t16_budget_exhausted_no_paid_call_and_not_retryable(client, ai):
    async with SessionLocal() as s:
        s.add(AiCall(agent="test", model="test", cost_usd=get_settings().ai_budget_usd))
        await s.commit()
    await add_passages(SHAHADA_EN)
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable" and b["reason_code"] == "service_limit" and b["retryable"] is False
    assert ai.calls == []


async def test_knw01_t28_shared_call_cap_is_never_exceeded(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    monkeypatch.setattr(get_settings(), "ask_max_external_calls", 3)
    ai.on("router", "not json", ROUTE_GENERAL)  # the JSON retry counts too: 2 calls
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable" and b["reason_code"] == "temporarily_unavailable"
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count(AiCall.id))) <= 3
    assert "composer" not in ai.agents_called()  # no composition without room to verify it
    (row,) = await log_rows()
    assert row.trace["calls"] <= 3 and row.detail == "call_budget_exhausted"


async def test_knw01_t28_rounds_share_one_counter_across_retries_and_fallback(client, ai):
    more = [{"id": f"hadeethenc:en:{200 + i}", "lang": "en", "quote_text": f"TEST_QUOTE_TEXT ilaha meaning part {i}"} for i in range(10)]
    await add_passages(SHAHADA_EN, *more)
    ai.on("router", "not json", "not json", ROUTE_GENERAL)  # main twice, then the fallback model: 3 calls
    ai.on("composer", {"sufficient": False, "answer": "", "sources": []})  # → the one expansion round
    ai.on("composer", {**GOOD_EN, "answer": "Worship is for Allah. {{q:hadeethenc:en:999}}", "sources": ["hadeethenc:en:999"]})
    b = await post(client, Q_EN)
    assert b["outcome"] == "verification_failed"  # no third composition: the repair round was used by the expansion
    (row,) = await log_rows()
    t = row.trace
    assert t["retrieval_rounds"] == 2 and t["compose_rounds"] == 2 and t["calls"] <= get_settings().ask_max_external_calls
    assert ai.agents_called().count("composer") == 2 and "support" not in ai.agents_called()


async def test_knw01_t24_violation_with_embeddings_down_is_not_hidden(client, ai):
    await add_passages(SHAHADA_EN)
    ai.embed_status = 503
    ai.on("router", ROUTE_GENERAL)
    bad = {"sufficient": False, "answer": "Worship is for Allah. {{q:hadeethenc:en:999}}", "sources": ["hadeethenc:en:999"]}
    ai.on("composer", bad, bad)
    b = await post(client, Q_EN)
    assert b["outcome"] == "verification_failed" and b["sources"] == []  # the invented id is not hidden as "no source"


async def test_knw01_t24_insufficient_with_embeddings_down_is_unavailable(client, ai):
    await add_passages(SHAHADA_EN)
    ai.embed_status = 503
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {"sufficient": False, "answer": "", "sources": []}, {"sufficient": False, "answer": "", "sources": []})
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable" and b["retryable"] is True  # degraded search: no claim of "no source"
    (row,) = await log_rows()
    assert row.detail == "retrieval_degraded_no_evidence"


async def test_knw01_t25_tagging_failure_keeps_the_verified_answer(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", GOOD_EN)
    ai.on("support", SUPPORTED)

    async def boom(*a, **k):
        raise RuntimeError("tagger crashed")

    monkeypatch.setattr(tasks, "tag_question", boom)
    b = await post(client, Q_EN, consent_objectives=True)
    assert b["outcome"] == "answered" and b["objective_id"] is None
    assert "ObjectiveAsked" not in [e.name for e in await outbox()]


async def test_knw01_t26_diagnostic_log_failure_still_returns_the_answer(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", GOOD_EN)
    ai.on("support", SUPPORTED)

    def broken_session():
        raise OperationalError("insert", {}, Exception("db down"))

    monkeypatch.setattr(ask, "SessionLocal", broken_session)
    b = await post(client, Q_EN)
    assert b["outcome"] == "answered"
    assert await log_rows() == []


async def test_knw01_t26_required_effect_failure_is_503_without_partial_effects(client, ai, monkeypatch):
    await add_passages({**SHAHADA_EN, "id": "binbaz:en:7", "kind": "fatwa"})
    ai.on("router", {"route": "personal", "level": "D"})  # an answered personal case publishes EscalationRequested
    ai.on("composer", {"sufficient": True, "answer": "The source speaks generally.", "sources": ["binbaz:en:7"]})
    ai.on("support", SUPPORTED)

    async def failing_publish(*a, **k):
        raise OperationalError("insert outbox", {}, Exception("db down"))

    monkeypatch.setattr(ask, "publish", failing_publish)
    r = await client.post("/api/ask", json={"question": "Should I attend my mother's party?", "lang": "en"})
    assert r.status_code == 503 and r.json() == {"detail": "effects_failed"}
    assert await outbox() == []  # nothing half-saved, so a retry cannot duplicate it
    (row,) = await log_rows()
    assert row.outcome == "error" and row.detail == "effects_failed"


async def test_knw01_t29_source_removed_before_the_cards_is_not_answered(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on("support", SUPPORTED)
    real = agents.compose_answer

    async def compose_then_remove(*a, **k):
        ai.on("composer", GOOD_EN)
        out = await real(*a, **k)
        async with SessionLocal() as s:
            await s.execute(delete(Passage).where(Passage.id == "hadeethenc:en:101"))
            await s.commit()
        return out

    monkeypatch.setattr(agents, "compose_answer", compose_then_remove)
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable" and b["sources"] == [] and "Nothing deserves" not in b["answer"]


def _approved(**over):
    entry = {
        "id": "aa-shahada-en",
        "lang": "en",
        "questions": ["What does la ilaha illa allah mean?"],
        "answer": "TEST_APPROVED_ANSWER {{q:hadeethenc:en:101}}",
        "sources": ["hadeethenc:en:101"],
        "source_versions": {"hadeethenc:en:101": "test-1"},
        "status": "approved",
        "reviewer": "TEST_REVIEWER",
        "approved_at": "2026-10-06",
    }
    entry.update(over)
    return entry


async def test_knw01_t30_faq_off_and_on_with_the_same_question(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    monkeypatch.setattr(screen, "approved_answers", lambda: [_approved()])
    ai.always("router", ROUTE_GENERAL)
    ai.always("composer", GOOD_EN)
    ai.always("support", SUPPORTED)
    monkeypatch.setattr(get_settings(), "ask_approved_faq_enabled", False)
    off = await post(client, Q_EN)
    assert off["outcome"] == "answered" and "composer" in ai.agents_called()  # the general path, measured alone
    ai.calls.clear()
    monkeypatch.setattr(get_settings(), "ask_approved_faq_enabled", True)
    on = await post(client, Q_EN)
    assert on["outcome"] == "cached" and on["answer"] == "TEST_APPROVED_ANSWER {{q:hadeethenc:en:101}}"
    assert "composer" not in ai.agents_called()


@pytest.mark.parametrize(
    "entry",
    [
        _approved(status="draft"),
        _approved(reviewer=""),
        _approved(source_versions={"hadeethenc:en:101": "older-version"}),
        _approved(source_versions={}),
        _approved(
            answer="TEST_APPROVED_ANSWER {{q:hadeethenc:en:404}}",
            sources=["hadeethenc:en:404"],
            source_versions={"hadeethenc:en:404": "test-1"},
        ),
        _approved(lang="ar"),
    ],
)
async def test_knw01_t19_invalid_approved_answer_is_never_served(client, ai, monkeypatch, entry):
    await add_passages(SHAHADA_EN)
    monkeypatch.setattr(screen, "approved_answers", lambda: [entry])
    monkeypatch.setattr(get_settings(), "ask_approved_faq_enabled", True)
    ai.on("router", 503, 503)  # router down: only an exact, valid approved answer could be served
    b = await post(client, Q_EN)
    assert b["outcome"] == "unavailable"


async def test_knw01_t19_approved_answer_from_a_disabled_source_is_not_served(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    monkeypatch.setattr(screen, "approved_answers", lambda: [_approved()])
    monkeypatch.setattr(get_settings(), "ask_approved_faq_enabled", True)
    monkeypatch.setattr(get_settings(), "knw_answer_sources", "quranenc,binbaz")
    ai.on("router", 503, 503)
    assert (await post(client, Q_EN))["outcome"] == "unavailable"


async def test_knw01_t16_budget_gone_serves_valid_approved_answer(client, ai, monkeypatch):
    await add_passages(SHAHADA_EN)
    async with SessionLocal() as s:
        s.add(AiCall(agent="test", model="test", cost_usd=get_settings().ai_budget_usd))
        await s.commit()
    monkeypatch.setattr(screen, "approved_answers", lambda: [_approved()])
    monkeypatch.setattr(get_settings(), "ask_approved_faq_enabled", True)
    b = await post(client, "what does la ilaha illa allah mean")
    assert b["outcome"] == "cached" and ai.calls == []


# --- R7: the reviewer-approved answers in content/knowledge/approved-answers.json ---


def _file_entry(entry_id: str) -> dict:
    """An entry of the real content file, through the real loader."""
    return next(e for e in screen.approved_answers() if e["id"] == entry_id)


async def _add_entry_passages(entry: dict) -> None:
    """Dummy passages (plan rule 6) under the entry's ids, at the versions the reviewer approved."""
    rows = entry["source_versions"]
    await add_passages(
        *(
            {
                "id": r["id"],
                "lang": entry["lang"],
                "source_id": r["source_id"],
                "ref_key": r["ref_key"],
                "quote_text": f"TEST_QUOTE_TEXT {r['id']}",
            }
            for r in rows
        )
    )
    async with SessionLocal() as s:
        for r in rows:
            await s.execute(update(Passage).where(Passage.id == r["id"]).values(version=r["version"]))
        await s.commit()


def _only_entry(monkeypatch, entry: dict) -> None:
    """Replace the content file with one entry; the real status filter still runs."""
    real = screen._load
    monkeypatch.setattr(screen, "_load", lambda name: {"answers": [entry]} if name == "approved-answers.json" else real(name))


def test_knw01_r7_on_by_default_and_file_entries_are_reviewer_approved(monkeypatch):
    assert Settings.model_fields["ask_approved_faq_enabled"].default is True
    monkeypatch.setenv("ASK_APPROVED_FAQ_ENABLED", "false")
    assert Settings().ask_approved_faq_enabled is False  # the env override still switches it off
    entries = screen.approved_answers()
    assert len(entries) == 9
    for e in entries:
        assert e["status"] == "approved" and e["reviewer"] and e["approved_at"]
        assert set(approved.entry_ids(e)) <= set(approved._versions(e)), e["id"]  # every cited id has its approved version


async def test_knw01_r7_reviewer_approved_answer_is_served_with_its_sources(client, ai):
    entry = _file_entry("suggest-wudu-en")
    await _add_entry_passages(entry)
    ai.on("router", ROUTE_GENERAL)
    b = await post(client, "What is the reward of wudu?")  # ask.suggest.2 in English
    assert b["outcome"] == "cached" and b["answer"] == entry["answer"]
    assert sorted(s["id"] for s in b["sources"]) == sorted(approved.entry_ids(entry))
    assert {s["id"]: s["version"] for s in b["sources"]} == approved._versions(entry)
    assert ai.agents_called() == ["router"]  # no composition


async def test_knw01_r7_outage_serves_reviewer_approved_answer(client, ai):
    entry = _file_entry("suggest-shahada-ar")
    await _add_entry_passages(entry)
    ai.on("router", 503, 503)  # main and fallback down (sourced-answer rule 2, error example)
    b = await post(client, "ما معنى الشهادتين؟", "ar")
    assert b["outcome"] == "cached" and b["answer"] == entry["answer"]
    assert sorted(s["id"] for s in b["sources"]) == sorted(approved.entry_ids(entry))


@pytest.mark.parametrize("over", [{"status": "draft"}, {"status": "returned"}, {"reviewer": None}, {"approved_at": None}])
async def test_knw01_r7_unapproved_entry_is_not_served(client, ai, monkeypatch, over):
    entry = {**_file_entry("suggest-wudu-en"), **over}
    await _add_entry_passages(entry)
    _only_entry(monkeypatch, entry)
    ai.on("router", 503, 503)
    b = await post(client, "What is the reward of wudu?")
    assert b["outcome"] == "unavailable" and b["sources"] == [] and b["answer"] != entry["answer"]


async def test_knw01_r7_flag_off_approved_answer_not_served(client, ai, monkeypatch):
    entry = _file_entry("suggest-wudu-en")
    await _add_entry_passages(entry)
    monkeypatch.setattr(get_settings(), "ask_approved_faq_enabled", False)
    ai.on("router", 503, 503)
    b = await post(client, "What is the reward of wudu?")
    assert b["outcome"] == "unavailable" and b["answer"] == screen.fixed("unavailable", "en")


async def test_knw01_t20_every_passage_of_one_reference_stays_for_verification(client, ai):
    await add_passages(SHAHADA_AR, SHAHADA_AR_2, WUDU_AR)
    ai.on("router", ROUTE_GENERAL)
    ai.on(
        "composer",
        {
            "sufficient": True,
            "answer": "نص تجريبي أول. {{q:binbaz:ar:6940:1}} ونص تجريبي ثان. {{q:binbaz:ar:6940:2}}",
            "sources": ["binbaz:ar:6940:1", "binbaz:ar:6940:2"],
        },
    )
    ai.on("support", SUPPORTED)
    b = await post(client, "ما معنى الشهادتين؟", "ar")
    assert b["outcome"] == "answered"
    assert [(s["id"], s["ref_key"], s["version"]) for s in b["sources"]] == [
        ("binbaz:ar:6940:1", "6940", "test-1"),
        ("binbaz:ar:6940:2", "6940", "test-1"),
    ]  # two passages, one reference: the app shows one card (frontend test), both ids stay


async def test_knw01_t21_safety_routes_survive_normalization_and_repair(client, ai):
    b = await post(client, "طَرَدَنِي أهلي من البيت!!")  # danger phrase with diacritics and punctuation
    assert b["outcome"] == "danger" and ai.calls == []
    await add_passages({**SHAHADA_EN, "id": "binbaz:en:7", "kind": "fatwa"})
    ai.on("router", {"route": "personal", "level": "D"})
    ai.on("composer", {"sufficient": True, "answer": "عام {{q:binbaz:en:7}}", "sources": ["binbaz:en:7"]})
    ai.on("composer", {"sufficient": True, "answer": "The source speaks generally. {{q:binbaz:en:7}}", "sources": ["binbaz:en:7"]})
    ai.on("support", SUPPORTED)
    p = await post(client, "Should I attend my mother's birthday?")
    assert p["outcome"] == "answered" and p["notes"] == [screen.fixed("personal_note", "en")] and p["should_escalate"] is True


async def test_knw01_t32_flags_off_service_keeps_working(client, ai, monkeypatch):
    for flag in ("ask_query_normalization_enabled", "ask_repair_enabled", "ask_approved_faq_enabled"):
        monkeypatch.setattr(get_settings(), flag, False)
    await add_passages(SHAHADA_EN)
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", GOOD_EN)
    ai.on("support", SUPPORTED)
    assert (await post(client, Q_EN))["outcome"] == "answered"
    ai.on("router", ROUTE_GENERAL)
    ai.on("composer", {**GOOD_EN, "sources": ["hadeethenc:en:999"]})
    b = await post(client, Q_EN)
    assert b["outcome"] == "verification_failed"  # error separation stays on with every flag off


def _alembic(url: str, *args: str) -> None:
    backend = Path(__file__).resolve().parents[1]
    env = {**os.environ, "DATABASE_URL": url}
    r = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend, env=env, capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stderr[-2000:]


async def test_knw01_t32_migration_keeps_old_rows_and_the_previous_writer():
    """Upgrade a database that holds rows of the previous schema; the rows stay
    readable with NULL in the new columns, and an insert written the old way
    (without the new columns) still works on the new schema."""
    base = get_settings().database_url
    name = base.rsplit("/", 1)[1] + "_mig"
    url = base.rsplit("/", 1)[0] + "/" + name
    admin = create_async_engine(base, isolation_level="AUTOCOMMIT")
    async with admin.connect() as c:
        await c.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
        await c.execute(text(f'CREATE DATABASE "{name}"'))
    eng = create_async_engine(url)
    try:
        async with eng.begin() as c:
            await c.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await c.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await asyncio.to_thread(_alembic, url, "upgrade", "d1e2f3a4b5c6")
        old_insert = (
            "INSERT INTO knw_answer_log (id, lang, route, level, outcome, latency_ms) VALUES (gen_random_uuid(), 'ar', 'general', 'A', 'answered', 10);"
            "INSERT INTO knw_ai_calls (id, agent, model, prompt_tokens, completion_tokens, cost_usd, ok, latency_ms) "
            "VALUES (gen_random_uuid(), 'router', 'm', 1, 1, 0.001, true, 5)"
        )
        async with eng.begin() as c:
            for stmt in old_insert.split(";"):
                await c.execute(text(stmt))
        await asyncio.to_thread(_alembic, url, "upgrade", "head")
        async with eng.begin() as c:
            for stmt in old_insert.split(";"):  # the previous image writes without the new columns
                await c.execute(text(stmt))
            rows = (await c.execute(text("SELECT outcome, ask_id, reason_code, trace FROM knw_answer_log"))).all()
            calls = (await c.execute(text("SELECT agent, ask_id FROM knw_ai_calls"))).all()
        assert rows == [("answered", None, None, None)] * 2
        assert calls == [("router", None)] * 2
    finally:
        await eng.dispose()
        async with admin.connect() as c:
            await c.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
        await admin.dispose()
