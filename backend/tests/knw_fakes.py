"""Test doubles for the Knowledge AI layer: OpenRouter answered from recorded
envelopes (tests/fixtures/openrouter) with scripted contents, and
deterministic bag-of-words embeddings. No network: respx refuses any
request that is not mocked."""

import copy
import hashlib
import json
import math
import re
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
import respx

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.knowledge import search, source_policy
from app.knowledge.ai import client
from app.knowledge.ai.textcheck import words
from app.knowledge.models import EMBED_DIM, Passage, Source

FIX = Path(__file__).parent / "fixtures" / "openrouter"
CHAT = json.loads((FIX / "chat_completion.json").read_text())
EMB = json.loads((FIX / "embeddings.json").read_text())
BASE = "https://openrouter.ai/api/v1"

AGENT_OF_HEADING = {
    "# Rafeeq router": "router",
    "# Rafeeq answer composer": "composer",
    "# Rafeeq support checker": "support",
    "# Rafeeq mistake explainer": "explainer",
    "# Rafeeq learning guide": "guide",
    "# Rafeeq objective tagger": "tagger",
}


def vector(text: str) -> list[float]:
    """Deterministic bag-of-words vector: texts sharing words are close."""
    v = [0.0] * EMBED_DIM
    for w in words(text):
        v[int(hashlib.md5(w.encode()).hexdigest(), 16) % EMBED_DIM] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


class FakeOpenRouter:
    """Scripted replies per agent. A reply is a dict (sent as JSON content),
    a string (sent as is), or an int HTTP status (an outage)."""

    def __init__(self, mock: respx.MockRouter):
        self.replies: dict[str, list] = defaultdict(list)
        self.defaults: dict[str, object] = {}
        self.calls: list[tuple[str, dict]] = []
        self.embed_status: int | None = None
        mock.post(f"{BASE}/chat/completions").mock(side_effect=self._chat)
        mock.post(f"{BASE}/embeddings").mock(side_effect=self._embed)

    def on(self, agent: str, *replies) -> "FakeOpenRouter":
        self.replies[agent].extend(replies)
        return self

    def always(self, agent: str, reply) -> "FakeOpenRouter":
        self.defaults[agent] = reply
        return self

    def agents_called(self) -> list[str]:
        return [a for a, _ in self.calls]

    def _chat(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        system = body["messages"][0]["content"]
        agent = next((a for h, a in AGENT_OF_HEADING.items() if system.startswith(h)), "bare")
        self.calls.append((agent, body))
        queue = self.replies.get(agent)
        reply = queue.pop(0) if queue else self.defaults.get(agent, 503)
        if isinstance(reply, int):
            return httpx.Response(reply, json={"error": {"code": reply, "message": "scripted outage"}})
        out = copy.deepcopy(CHAT)
        del out["_about"]
        out["model"] = body["model"]
        out["choices"][0]["message"]["content"] = reply if isinstance(reply, str) else json.dumps(reply, ensure_ascii=False)
        return httpx.Response(200, json=out)

    def _embed(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.calls.append(("embed", body))
        if self.embed_status:
            return httpx.Response(self.embed_status, json={"error": {"code": self.embed_status}})
        out = copy.deepcopy(EMB)
        del out["_about"]
        out["data"] = [{"object": "embedding", "index": i, "embedding": vector(t)} for i, t in enumerate(body["input"])]
        return httpx.Response(200, json=out)


@pytest.fixture
def ai(monkeypatch):
    """OpenRouter replaced by scripted replies; every other host refused."""
    monkeypatch.setattr(get_settings(), "openrouter_api_key", "test-key")
    client.reset_spend_cache()
    search._cache.clear()
    source_policy.reset_readiness_cache()
    with respx.mock(assert_all_called=False, assert_all_mocked=True) as mock:
        yield FakeOpenRouter(mock)
    client.reset_spend_cache()


SOURCES = {
    "quranenc": "QuranEnc.com",
    "hadeethenc": "HadeethEnc.com",
    "binbaz": "binbaz.org.sa",
    "islamhouse_enc": "IslamHouse encyclopedia",
    "islamqa": "الإسلام سؤال وجواب",
}


async def add_passages(*rows: dict, embed: bool = True) -> None:
    """Insert test passages (dummy text only: plan rule 6, never real scripture)."""
    async with SessionLocal() as s:
        for sid, name in SOURCES.items():
            if await s.get(Source, sid) is None:
                s.add(Source(id=sid, name=name, mode="index", license="test", url=f"https://{sid}.example", versions={}))
        await s.flush()
        for r in rows:
            text = r["quote_text"] + ("\n\n" + r.get("context_text", "") if r.get("context_text") else "")
            s.add(
                Passage(
                    id=r["id"],
                    source_id=r.get("source_id", r["id"].split(":")[0]),
                    kind=r.get("kind", "hadith"),
                    lang=r["lang"],
                    ref=r.get("ref", {}),
                    ref_key=r.get("ref_key", r["id"].split(":")[-1]),
                    quote_text=r["quote_text"],
                    context_text=r.get("context_text", ""),
                    meta=r.get("meta", {}),
                    version="test-1",
                    origin_url=f"https://example.test/{r['id']}",
                    fetched_at=datetime.now(UTC),
                    text_hash="sha256:" + hashlib.sha256(text.encode()).hexdigest(),
                    embedding=vector(text) if embed else None,
                )
            )
        await s.commit()
    source_policy.reset_readiness_cache()  # new rows: per-language readiness must be read again


def strip_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()
