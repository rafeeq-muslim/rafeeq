"""PRD live v3 §4: the real connectors, found and checked from this backend.

Each entry records what the backend actually calls (the sites' own public
endpoints, the same ones their web pages use), the languages served, the
hosts a fetch may touch, and whether the connector can be used at all from
the backend. There is no priority field and no order of preference: the
orchestrator starts every enabled connector at once.

Evidence of each check (dates, requests, results) is in
docs/engineering/implementation/KNW-live-source-access-report.md §2."""

import json
import logging
from dataclasses import dataclass
from types import ModuleType
from typing import Any

import httpx

from app.core.config import get_settings
from app.knowledge.live_sources import http
from app.knowledge.live_sources import types as T

log = logging.getLogger("rafeeq.live")

POLICY_LOCAL = "local-index-v2"
POLICY_LIVE = "live-enabled-sources-any-sufficient-v3"


@dataclass
class Record:
    """One record read in full from the source (before chunking)."""

    external_id: str
    canonical_url: str
    lang: str
    title: str
    body: str  # plain text of the answer / card, HTML removed only
    question: str = ""
    summary: str = ""
    attribution: str | None = None
    kind: str = "fatwa"


class Call:
    """What an adapter may do: GET an allowed URL inside its budget."""

    def __init__(self, client: httpx.AsyncClient, budget: http.SourceBudget, timeout_s: float):
        self.client = client
        self.budget = budget
        self.timeout_s = timeout_s

    async def get(self, url: str, params: dict[str, str] | None = None, accept: str = "application/json") -> http.Fetched:
        return await http.get(self.client, self.budget, url, params=params, accept=accept, per_request_s=self.timeout_s)

    async def get_json(self, url: str, params: dict[str, str] | None = None) -> Any:
        f = await self.get(url, params)
        try:
            return json.loads(f.text)
        except ValueError:
            raise http.FetchError(T.BAD_RESPONSE) from None


@dataclass(frozen=True)
class Connector:
    id: str
    name: dict[str, str]  # display name per language ("default" key required)
    hosts: frozenset[str]
    langs: frozenset[str]
    adapter: ModuleType
    licence: str  # summary; the authority is docs/agents/sources.md

    def label(self, lang: str) -> str:
        return self.name.get(lang) or self.name["default"]

    def blocked_reason(self) -> str | None:
        """Why the backend may not call this connector now, or None."""
        return self.adapter.blocked_reason() if hasattr(self.adapter, "blocked_reason") else None


def _connectors() -> dict[str, Connector]:
    from app.knowledge.live_sources import binbaz, islamic_content, islamqa

    return {
        c.id: c
        for c in (
            Connector(
                "islamqa",
                {"ar": "الإسلام سؤال وجواب", "default": "IslamQA"},
                frozenset({"islamqa.info"}),
                frozenset({"ar", "en"}),
                islamqa,
                "Terms of Use: personal, non-commercial use; owner decision 2026-10-05, permission request pending",
            ),
            Connector(
                "binbaz",
                {"ar": "موقع الشيخ ابن باز", "default": "binbaz.org.sa"},
                frozenset({"binbaz.org.sa"}),
                frozenset({"ar"}),
                binbaz,
                "Site footer: transfer allowed for every Muslim with the source named; AI-assistant use to confirm",
            ),
            Connector(
                "islamic_content",
                {"ar": "موسوعة المحتوى الإسلامي", "default": "Islamic Content Encyclopedia"},
                frozenset({"islamenc.com"}),
                frozenset({"ar", "en", "tl"}),
                islamic_content,
                "All rights reserved; search disallowed by robots.txt; data access to request",
            ),
        )
    }


CONNECTORS: dict[str, Connector] = {}


def connectors() -> dict[str, Connector]:
    if not CONNECTORS:
        CONNECTORS.update(_connectors())
    return CONNECTORS


def policy() -> str:
    p = get_settings().ask_source_policy.strip()
    return POLICY_LIVE if p == POLICY_LIVE else POLICY_LOCAL


def live_on() -> bool:
    return policy() == POLICY_LIVE


_warned: set[str] = set()


def enabled() -> list[Connector]:
    """Connectors listed in ASK_LIVE_SOURCES (unknown names are logged and ignored)."""
    if not live_on():
        return []
    out = []
    for name in dict.fromkeys(s.strip() for s in get_settings().ask_live_sources.split(",") if s.strip()):
        c = connectors().get(name)
        if c is None:
            if name not in _warned:
                _warned.add(name)
                log.error("ASK_LIVE_SOURCES has an unknown connector %r; it is ignored", name)
            continue
        out.append(c)
    return out


def label(source_id: str, lang: str) -> str:
    c = connectors().get(source_id)
    return c.label(lang) if c else source_id


def allowed_hosts() -> frozenset[str]:
    """Every connector host (a saved live answer may link only to these)."""
    return frozenset().union(*(c.hosts for c in connectors().values()))
