"""PRD live v3 §14: opt-in smoke test against the REAL sites (and, if asked,
the real models). Never runs in CI: every test is skipped unless
RAFEEQ_LIVE_SMOKE=1 is set by a person on purpose.

  # connectors only (search + fetch, no model call, no cost):
  RAFEEQ_LIVE_SMOKE=1 uv run pytest -q -s tests/live_smoke
  # also end-to-end answers through /api/ask with the real models (costs a few cents):
  RAFEEQ_LIVE_SMOKE=1 RAFEEQ_LIVE_SMOKE_AI=1 OPENROUTER_API_KEY=... uv run pytest -q -s tests/live_smoke

Polite by construction: public questions only (never user text), one
connector at a time, at most ASK_LIVE_MAX_CALLS_PER_SOURCE requests each,
an honest User-Agent, and a pause between questions. The encyclopedia's
search is not called (robots.txt disallows /*/search); only one public card
page is fetched. Results go to stdout and, with RAFEEQ_LIVE_SMOKE_OUT=path,
to a JSON file for the implementation report."""

import asyncio
import json
import os
import time

import pytest

from app.core.config import get_settings
from app.knowledge.live_sources import http, islamic_content, orchestrator, registry
from app.knowledge.live_sources import types as T

pytestmark = pytest.mark.skipif(os.environ.get("RAFEEQ_LIVE_SMOKE") != "1", reason="opt-in live smoke test (RAFEEQ_LIVE_SMOKE=1)")

CASES = [
    ("islamqa", "en", "Does sleeping break wudu?"),
    ("islamqa", "ar", "هل النوم ينقض الوضوء"),
    ("islamqa", "en", "Can a traveller combine prayers?"),
    ("binbaz", "ar", "هل النوم ينقض الوضوء"),
    ("binbaz", "ar", "حكم الجمع بين الصلاتين للمسافر"),
]
E2E = [
    ("en", "Does sleeping break wudu?"),
    ("ar", "هل النوم ينقض الوضوء"),
    ("ar", "حكم الجمع بين الصلاتين للمسافر"),
    ("en", "Can a traveller combine prayers?"),
]
RESULTS: list[dict] = []


def _dump() -> None:
    out = os.environ.get("RAFEEQ_LIVE_SMOKE_OUT")
    if out:
        with open(out, "w", encoding="utf-8") as f:
            json.dump(RESULTS, f, ensure_ascii=False, indent=1)


@pytest.fixture
def one_connector(monkeypatch):
    st = get_settings()
    monkeypatch.setattr(st, "ask_source_policy", registry.POLICY_LIVE)

    def use(name: str) -> None:
        monkeypatch.setattr(st, "ask_live_sources", name)

    return use


@pytest.mark.parametrize(("source", "lang", "question"), CASES)
async def test_knw_live_smoke_search_and_fetch(one_connector, source, lang, question):
    one_connector(source)
    t = time.monotonic()
    coll = await orchestrator.collect(question, question, lang, "smoke", get_settings().ask_live_window_seconds)
    ms = int((time.monotonic() - t) * 1000)
    (res,) = coll.results
    row = {
        "kind": "connector",
        "source": source,
        "lang": lang,
        "question": question,
        "status": res.status,
        "reason": res.reason_code,
        "candidates": [(c.external_id, c.title) for c in res.candidates],
        "evidence": [(e.evidence_id, e.canonical_url, len(e.source_text)) for e in res.evidence],
        "calls": res.calls,
        "ms": ms,
    }
    RESULTS.append(row)
    _dump()
    print(json.dumps(row, ensure_ascii=False))
    await asyncio.sleep(1.0)  # polite pause
    assert res.attempted and res.status == "ok", row
    assert all(e.canonical_url.startswith(f"https://{next(iter(registry.connectors()[source].hosts))}/") for e in res.evidence)


async def test_knw_live_smoke_encyclopedia_card_fetch_only():
    """The search is not called (robots.txt). One public card page proves the fetch."""
    st = get_settings()
    shared = http.Budget(2, time.monotonic() + 40)
    budget = http.SourceBudget(shared, 2, hosts=frozenset({"islamenc.com"}))
    client = http.new_client(st.ask_live_user_agent)
    t = time.monotonic()
    try:
        call = registry.Call(client, budget, 30.0)
        rec = await islamic_content.fetch(call, T.Candidate("islamic_content", "26011", "ar", "", 1, meta={"enc_id": "102"}))
    finally:
        await client.aclose()
    row = {
        "kind": "encyclopedia_fetch",
        "url": rec.canonical_url,
        "title": rec.title,
        "chars": len(rec.body),
        "ms": int((time.monotonic() - t) * 1000),
    }
    RESULTS.append(row)
    _dump()
    print(json.dumps(row, ensure_ascii=False))
    assert rec.body and rec.canonical_url == "https://islamenc.com/ar/enc/102/card/26011"


@pytest.mark.skipif(os.environ.get("RAFEEQ_LIVE_SMOKE_AI") != "1", reason="end-to-end with real models: RAFEEQ_LIVE_SMOKE_AI=1")
@pytest.mark.parametrize(("lang", "question"), E2E)
async def test_knw_live_smoke_end_to_end(client, monkeypatch, lang, question):
    from sqlalchemy import func, select

    from app.core.db import SessionLocal
    from app.knowledge.ai import client as ai_client
    from app.knowledge.models import AiCall, AnswerLog

    st = get_settings()
    assert st.openrouter_api_key, "OPENROUTER_API_KEY is needed for the end-to-end smoke test"
    monkeypatch.setattr(st, "ask_source_policy", registry.POLICY_LIVE)
    monkeypatch.setattr(st, "ask_live_sources", "islamqa,binbaz,islamic_content")
    ai_client.reset_spend_cache()
    t = time.monotonic()
    r = await client.post("/api/ask", json={"question": question, "lang": lang})
    ms = int((time.monotonic() - t) * 1000)
    b = r.json()
    async with SessionLocal() as s:
        cost = float(await s.scalar(select(func.coalesce(func.sum(AiCall.cost_usd), 0.0)).where(AiCall.ask_id == b.get("ask_id"))) or 0)
        log = (await s.scalars(select(AnswerLog).where(AnswerLog.ask_id == b.get("ask_id")))).first()
    row = {
        "kind": "end_to_end",
        "lang": lang,
        "question": question,
        "outcome": b.get("outcome"),
        "reason_code": b.get("reason_code"),
        "detail": log.detail if log else None,
        "used_source_ids": b.get("used_source_ids"),
        "live_search": b.get("live_search"),
        "sources": [(c["id"], c["origin_url"]) for c in b.get("sources", [])],
        "answer": b.get("answer"),
        "ms": ms,
        "cost_usd": round(cost, 6),
        "stages": log.trace.get("stages") if log and log.trace else None,
    }
    RESULTS.append(row)
    _dump()
    print(json.dumps(row, ensure_ascii=False))
    await asyncio.sleep(2.0)
    assert r.status_code == 200
