"""OpenRouter client with model routing, JSON mode and a hard spend guard.

- Tiers come from settings: main (composer, explainer), fast (router,
  verifier, checkers, tagger, guide), fallback (used when a tier's model
  fails). rules.md §2.7: a backup model.
- Every call writes one `knw_ai_calls` row: agent, model, tokens, the
  `usage.cost` OpenRouter returns, ok, latency. Never the prompt text.
- Spend guard: before any paid call, the cumulative cost of all calls must
  be below `AI_BUDGET_USD` (product owner: $10). Past it, `BudgetExceeded`
  is raised and callers fall back to fixed replies; no request is sent.
  Two daily ceilings sit under the total: the corpus embedding job (agent
  "embed") has `AI_EMBED_DAILY_BUDGET_USD`, everything else (answers, query
  embeddings, learning tasks) has `AI_DAILY_BUDGET_USD`, so neither can
  starve the other (KNW-02 SC3).
- Inside an /api/ask pipeline the `RequestContext` (request_context.py)
  counts every call, retries and fallback included, against one budget,
  shortens each timeout to the time left, and its `ask_id` is written on
  the cost row (KNW-01 reliability §7, §14.2).
- The provider receives only what the caller passes (question and passages,
  or card text); callers never pass identity (rules.md §2.6). Providers that
  keep or train on prompts are excluded (`data_collection: deny`).
"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import cache
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.knowledge.ai.errors import AiUnavailable, BudgetExceeded, CallBudgetExhausted, DeadlineExceeded
from app.knowledge.models import AiCall
from app.knowledge.request_context import current as current_request

__all__ = ["AiUnavailable", "BudgetExceeded", "CallBudgetExhausted", "DeadlineExceeded"]

log = logging.getLogger("rafeeq.ai")

PROMPTS = Path(__file__).parent / "prompts"
MARGIN_USD = 0.005  # stop a little before the cap, so one more call cannot cross it
# USD per million tokens (in, out), measured on openrouter.ai/api/v1/models on 2026-10-05.
# Used only if a response lacks `usage.cost`; unknown models are priced high on purpose.
PRICES: dict[str, tuple[float, float]] = {
    "google/gemma-4-31b-it": (0.09, 0.34),
    "google/gemma-4-26b-a4b-it": (0.0765, 0.255),
    "deepseek/deepseek-v4-pro": (0.2088, 0.4176),
    "qwen/qwen3.8-flash": (0.15, 0.47),
    "baai/bge-m3": (0.01, 0.0),
}
UNKNOWN_PRICE = (2.0, 8.0)


EMBED_JOB_AGENT = "embed"  # the corpus embedding job; its own daily ceiling


class _CallFailed(Exception):
    pass


@dataclass
class ChatResult:
    data: Any  # parsed JSON (dict) or text
    model: str
    cost: float


@cache
def prompt(name: str) -> str:
    """Prompt text from app/knowledge/ai/prompts/<name>.md (reviewed like code)."""
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


# --- spend guard --------------------------------------------------------------

_spent: float | None = None
_spent_at = 0.0
_today: float | None = None  # today's spend except the embedding job
_today_embed: float | None = None  # today's spend of the embedding job


async def spent() -> float:
    """Cumulative cost of every recorded call (refreshed from the DB each minute)."""
    global _spent, _spent_at, _today, _today_embed
    if _spent is None or time.monotonic() - _spent_at > 60:
        midnight = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        total = func.coalesce(func.sum(AiCall.cost_usd), 0.0)
        async with SessionLocal() as s:
            _spent = float(await s.scalar(select(total)) or 0.0)
            _today = float(await s.scalar(select(total).where(AiCall.at >= midnight, AiCall.agent != EMBED_JOB_AGENT)) or 0.0)
            _today_embed = float(await s.scalar(select(total).where(AiCall.at >= midnight, AiCall.agent == EMBED_JOB_AGENT)) or 0.0)
        _spent_at = time.monotonic()
    return _spent


async def spent_today(agent: str | None = None) -> float:
    """Today's spend under the ceiling that applies to `agent`."""
    await spent()
    return (_today_embed if agent == EMBED_JOB_AGENT else _today) or 0.0


def reset_spend_cache() -> None:
    global _spent, _today, _today_embed
    _spent = None
    _today = None
    _today_embed = None


async def guard(agent: str | None = None) -> None:
    st = get_settings()
    if not st.openrouter_api_key:
        raise AiUnavailable("no_key")
    if await spent() + MARGIN_USD >= st.ai_budget_usd:
        raise BudgetExceeded("budget")
    # Security review #5: a daily ceiling so one abusive client cannot spend
    # the whole budget in a day; everyone gets fixed replies until midnight UTC.
    # The embedding job has its own ceiling (KNW-02 SC3).
    ceiling = st.ai_embed_daily_budget_usd if agent == EMBED_JOB_AGENT else st.ai_daily_budget_usd
    if await spent_today(agent) + MARGIN_USD >= ceiling:
        raise BudgetExceeded("daily_budget")


def _cost(model: str, usage: dict) -> float:
    if usage.get("cost") is not None:
        return float(usage["cost"])
    pin, pout = PRICES.get(model, UNKNOWN_PRICE)
    return (usage.get("prompt_tokens", 0) * pin + usage.get("completion_tokens", 0) * pout) / 1e6


async def _record(agent: str, model: str, usage: dict, ok: bool, started: float) -> float:
    global _spent, _today, _today_embed
    cost = _cost(model, usage) if usage else 0.0
    ctx = current_request.get()
    try:
        async with SessionLocal() as s:
            s.add(
                AiCall(
                    agent=agent[:32],
                    model=model[:80],
                    prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
                    completion_tokens=int(usage.get("completion_tokens", 0) or 0),
                    cost_usd=cost,
                    ok=ok,
                    latency_ms=int((time.monotonic() - started) * 1000),
                    ask_id=ctx.ask_id if ctx else None,
                )
            )
            await s.commit()
    except Exception:  # the answer must not fail because the cost row could not be written
        log.exception("could not record AI call")
    if _spent is not None:
        _spent += cost
    if agent == EMBED_JOB_AGENT:
        if _today_embed is not None:
            _today_embed += cost
    elif _today is not None:
        _today += cost
    return cost


def _budgeted_timeout(default: float) -> float:
    """Inside an /api/ask pipeline: count the call and cap its timeout to the
    time left (KNW-01 reliability R5/R6). Raises before anything is sent."""
    ctx = current_request.get()
    return ctx.take_call(default) if ctx else default


# --- transport ----------------------------------------------------------------

_clients: dict[int, httpx.AsyncClient] = {}


def _client() -> httpx.AsyncClient:
    loop = id(asyncio.get_running_loop())
    c = _clients.get(loop)
    if c is None or c.is_closed:
        c = _clients[loop] = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0))
    return c


def _headers() -> dict[str, str]:
    st = get_settings()
    return {
        "Authorization": f"Bearer {st.openrouter_api_key}",
        "HTTP-Referer": st.public_url,
        "X-Title": "Rafeeq",
    }


async def _post(path: str, body: dict, timeout_s: float) -> dict:
    st = get_settings()
    try:
        r = await _client().post(f"{st.openrouter_base_url}{path}", json=body, headers=_headers(), timeout=timeout_s)
    except httpx.HTTPError as e:
        raise _CallFailed(type(e).__name__) from None
    if r.status_code != 200:
        raise _CallFailed(f"http_{r.status_code}")
    try:
        data = r.json()
    except ValueError:
        raise _CallFailed("bad_body") from None
    if "error" in data and not data.get("choices") and not data.get("data"):
        raise _CallFailed(f"error_{data['error'].get('code', '?') if isinstance(data['error'], dict) else '?'}")
    return data


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.S)


def parse_json(text: str | None) -> dict | None:
    if not text:
        return None
    t = _FENCE.sub("", text.strip())
    try:
        v = json.loads(t)
    except ValueError:
        i, j = t.find("{"), t.rfind("}")
        if i < 0 or j <= i:
            return None
        try:
            v = json.loads(t[i : j + 1])
        except ValueError:
            return None
    return v if isinstance(v, dict) else None


def chain(tier: str) -> list[str]:
    st = get_settings()
    first = {"main": st.ai_model_main, "fast": st.ai_model_fast, "fallback": st.ai_model_fallback}[tier]
    out = [first]
    if st.ai_model_fallback not in out:
        out.append(st.ai_model_fallback)
    return out


async def complete(
    agent: str,
    model: str,
    system: str,
    user: str,
    *,
    json_mode: bool,
    max_tokens: int,
    temperature: float = 0.0,
    timeout_s: float = 30.0,
) -> tuple[str, float]:
    """One paid call to one model. Returns (content, cost). Raises _CallFailed,
    or AiUnavailable subclasses (budget, deadline, call budget) before sending."""
    await guard(agent)
    timeout_s = _budgeted_timeout(timeout_s)
    body: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "usage": {"include": True},
        "provider": {"data_collection": "deny"},
        "reasoning": {"enabled": False},
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    started = time.monotonic()
    try:
        data = await _post("/chat/completions", body, timeout_s)
    except _CallFailed:
        await _record(agent, model, {}, False, started)
        raise
    usage = data.get("usage") or {}
    content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
    cost = await _record(agent, model, usage, bool(content), started)
    if not content:
        raise _CallFailed("empty")
    return content, cost


async def chat_json(
    agent: str,
    tier: str,
    system: str,
    user: str,
    *,
    max_tokens: int = 700,
    check=None,
    timeout_s: float = 30.0,
) -> ChatResult:
    """JSON from the tier's model, then the fallback model. An output that is
    not JSON, or fails `check`, is retried once on the same model (plan 4.6
    check 1). Raises BudgetExceeded or AiUnavailable."""
    total = 0.0
    reason = "invalid_output"
    for model in chain(tier):
        for _ in range(2):
            try:
                content, cost = await complete(agent, model, system, user, json_mode=True, max_tokens=max_tokens, timeout_s=timeout_s)
            except _CallFailed as e:
                reason = str(e)
                break  # transport failure: next model
            total += cost
            parsed = parse_json(content)
            if parsed is not None and (check is None or check(parsed)):
                return ChatResult(parsed, model, total)
    raise AiUnavailable(reason)


async def chat_text(agent: str, model: str, system: str, user: str, *, max_tokens: int = 700) -> ChatResult:
    """Plain text from one model (the KNW-04 bare-model baseline)."""
    try:
        content, cost = await complete(agent, model, system, user, json_mode=False, max_tokens=max_tokens)
    except _CallFailed as e:
        raise AiUnavailable(str(e)) from None
    return ChatResult(content, model, cost)


async def embed(texts: list[str], agent: str = "embed") -> list[list[float]]:
    """bge-m3 vectors (1024-d) for `texts`, in order."""
    st = get_settings()
    await guard(agent)
    timeout_s = _budgeted_timeout(60.0)
    started = time.monotonic()
    try:
        data = await _post("/embeddings", {"model": st.ai_embedding_model, "input": texts}, timeout_s)
    except _CallFailed as e:
        await _record(agent, st.ai_embedding_model, {}, False, started)
        raise AiUnavailable(str(e)) from None
    rows = sorted(data.get("data") or [], key=lambda d: d.get("index", 0))
    ok = len(rows) == len(texts)
    await _record(agent, st.ai_embedding_model, data.get("usage") or {}, ok, started)
    if not ok:
        raise AiUnavailable("embedding_count")
    return [r["embedding"] for r in rows]
