"""Mocked live connectors for PRD live v3 tests (no network).

Each site answers in the response shape recorded from the real endpoint on
2026-10-06 (docs/engineering/implementation/KNW-live-source-access-report.md
§2), with dummy texts only (plan rule 6: never real scripture). Model calls
are the scripted OpenRouter of tests/knw_fakes.py, on the same respx router;
every other host is refused."""

import asyncio
import json
from collections import defaultdict
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
import respx

from app.core.config import get_settings
from app.knowledge import search, source_policy
from app.knowledge.ai import client
from app.knowledge.live_sources import http as live_http
from app.knowledge.live_sources import registry
from tests.knw_fakes import FakeOpenRouter

PUBLIC_IP = "93.184.216.34"


@dataclass
class Rec:
    ref: str
    title: str
    body: str
    question: str = ""


@dataclass
class FakeSites:
    """Scripted sites. `records[source][lang]` is what a search finds; a
    status in `search_fail` / `fetch_fail` (int, or "timeout", or "hang")
    makes that call fail."""

    records: dict[str, dict[str, list[Rec]]] = field(default_factory=lambda: defaultdict(dict))
    search_fail: dict[str, object] = field(default_factory=dict)
    fetch_fail: dict[str, object] = field(default_factory=dict)
    retry_after: dict[str, str] = field(default_factory=dict)
    calls: list[tuple[str, str, httpx.Request]] = field(default_factory=list)  # (source, op, request)
    redirect_to: dict[str, str] = field(default_factory=dict)  # binbaz ref -> Location

    def add(self, source: str, lang: str, *recs: Rec) -> "FakeSites":
        self.records[source].setdefault(lang, []).extend(recs)
        return self

    def ops(self, source: str | None = None) -> list[tuple[str, str]]:
        return [(s, op) for s, op, _ in self.calls if source in (None, s)]

    async def _fail(self, source: str, how: object) -> httpx.Response | None:
        if how is None:
            return None
        if how == "timeout":
            raise httpx.ReadTimeout("scripted timeout")
        if how == "hang":
            await asyncio.sleep(30)
        headers = {"Retry-After": self.retry_after[source]} if source in self.retry_after else {}
        return httpx.Response(int(how), headers=headers, text="scripted failure")

    # --- islamqa.info --------------------------------------------------------------

    async def iq_search(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(("islamqa", "search", request))
        if r := await self._fail("islamqa", self.search_fail.get("islamqa")):
            return r
        q = parse_qs(urlsplit(str(request.url)).query)
        lang = q["lang"][0]
        rows = [
            {"id": int(x.ref), "reference": int(x.ref), "title": x.title, "question": f"<p>{x.question}</p>"}
            for x in self.records["islamqa"].get(lang, [])
        ]
        return httpx.Response(200, json={"Search": {"results": rows}, "article__Search": {"results": []}})

    async def iq_detail(self, request: httpx.Request, ref: str) -> httpx.Response:
        self.calls.append(("islamqa", "fetch", request))
        if r := await self._fail("islamqa", self.fetch_fail.get("islamqa")):
            return r
        lang = parse_qs(urlsplit(str(request.url)).query)["lang"][0]
        for x in self.records["islamqa"].get(lang, []):
            if x.ref == ref:
                return httpx.Response(
                    200,
                    json={
                        "id": ref,
                        "reference": ref,
                        "lang": lang,
                        "title": x.title,
                        "question": f"<p>{x.question}</p>",
                        "body": "".join(f"<p>{p}</p>\n" for p in x.body.split("\n")),
                        "description": "",
                        "source": {"reference": 1793, "title": "Islam Q&A"},
                    },
                )
        return httpx.Response(404, json={"message": "not found"})

    # --- binbaz.org.sa -------------------------------------------------------------

    async def bb_search(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(("binbaz", "search", request))
        if r := await self._fail("binbaz", self.search_fail.get("binbaz")):
            return r
        rows = [{"id": 1, "reference": int(x.ref), "title": x.title, "question": None} for x in self.records["binbaz"].get("ar", [])]
        return httpx.Response(200, json={"Search": {"results": rows, "total": len(rows), "suggestions": []}})

    async def bb_short(self, request: httpx.Request, ref: str) -> httpx.Response:
        self.calls.append(("binbaz", "fetch", request))
        if r := await self._fail("binbaz", self.fetch_fail.get("binbaz")):
            return r
        return httpx.Response(301, headers={"Location": self.redirect_to.get(ref, f"https://binbaz.org.sa/fatwas/{ref}/test-slug")})

    async def bb_page(self, request: httpx.Request, ref: str) -> httpx.Response:
        self.calls.append(("binbaz", "page", request))
        for x in self.records["binbaz"].get("ar", []):
            if x.ref == ref:
                body = "".join(f'<div style="text-align: justify;">{p}</div>\n' for p in x.body.split("\n"))
                html = (
                    '<html><body><article class="fatwa">'
                    f'<h1 class="article-title article-title--primary">{x.title}</h1>'
                    f'<h2 class="article-title article-title__question article-title--primary" itemprop="alternativeHeadline">'
                    f'<i class="fa"></i> <strong>س:</strong> {x.question}</h2>'
                    f'<div itemprop="articleBody" class="article-content">ج: {body}<br/>'
                    '<section class="footnotes"><ol><li><cite>TEST_CITATION</cite></li></ol></section></div>'
                    "</article></body></html>"
                )
                return httpx.Response(200, text=html, headers={"content-type": "text/html; charset=UTF-8"})
        return httpx.Response(404, text="")

    # --- islamenc.com --------------------------------------------------------------

    async def ic_search(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(("islamic_content", "search", request))
        if r := await self._fail("islamic_content", self.search_fail.get("islamic_content")):
            return r
        lang = parse_qs(urlsplit(str(request.url)).query)["lang"][0]
        rows = [
            {"type": "card", "title": x.title, "text": x.title, "metadata": {"external_id": x.ref, "enc_id": "102"}}
            for x in self.records["islamic_content"].get(lang, [])
        ]
        return httpx.Response(200, json=[{"type": "aya", "title": "TEST", "metadata": {}}, *rows])

    async def ic_card(self, request: httpx.Request, lang: str, card: str) -> httpx.Response:
        self.calls.append(("islamic_content", "fetch", request))
        if r := await self._fail("islamic_content", self.fetch_fail.get("islamic_content")):
            return r
        for x in self.records["islamic_content"].get(lang, []):
            if x.ref == card:
                url = f"https://islamenc.com/{lang}/enc/102/card/{card}"
                ld = {
                    "@context": "https://schema.org",
                    "@type": "QAPage",
                    "url": url,
                    "mainEntity": {
                        "@type": "Question",
                        "name": x.title,
                        "text": x.question or x.title,
                        "acceptedAnswer": {"@type": "Answer", "text": x.body, "author": {"name": "TEST_ENCYCLOPEDIA"}},
                    },
                }
                org = {"@type": "Organization", "name": "TEST"}
                html = (
                    f'<html><head><script type="application/ld+json">{json.dumps(org)}</script>'
                    f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script></head></html>'
                )
                return httpx.Response(200, text=html, headers={"content-type": "text/html; charset=utf-8"})
        return httpx.Response(404, text="")

    def mount(self, mock: respx.MockRouter) -> None:
        mock.get(url__regex=r"^https://islamqa\.info/api/search\?").mock(side_effect=self.iq_search)
        mock.get(url__regex=r"^https://islamqa\.info/api/posts/answer/(?P<ref>\d+)\?").mock(side_effect=self.iq_detail)
        mock.get(url__regex=r"^https://binbaz\.org\.sa/api/search\?").mock(side_effect=self.bb_search)
        mock.get(url__regex=r"^https://binbaz\.org\.sa/fatwas/(?P<ref>\d+)/x$").mock(side_effect=self.bb_short)
        mock.get(url__regex=r"^https://binbaz\.org\.sa/fatwas/(?P<ref>\d+)/test-slug$").mock(side_effect=self.bb_page)
        mock.get(url__regex=r"^https://islamenc\.com/api/search/suggestions\?").mock(side_effect=self.ic_search)
        mock.get(url__regex=r"^https://islamenc\.com/(?P<lang>[a-z]{2})/enc/102/card/(?P<card>\d+)$").mock(side_effect=self.ic_card)


@dataclass
class Live:
    ai: FakeOpenRouter
    sites: FakeSites
    resolved: dict[str, list[str]]


@pytest.fixture
def live(monkeypatch):
    """Live policy on with the three connectors; OpenRouter and the three
    sites scripted; DNS answers a public address unless a test changes it."""
    st = get_settings()
    monkeypatch.setattr(st, "openrouter_api_key", "test-key")
    monkeypatch.setattr(st, "ask_source_policy", registry.POLICY_LIVE)
    monkeypatch.setattr(st, "ask_live_sources", "islamqa,binbaz,islamic_content")
    monkeypatch.setattr(st, "ask_live_islamic_content_search_permitted", True)
    resolved: dict[str, list[str]] = {}

    async def fake_resolve(host: str) -> list[str]:
        return resolved.get(host, [PUBLIC_IP])

    monkeypatch.setattr(live_http, "resolve_host", fake_resolve)
    client.reset_spend_cache()
    search._cache.clear()
    source_policy.reset_readiness_cache()
    sites = FakeSites()
    with respx.mock(assert_all_called=False, assert_all_mocked=True) as mock:
        fake = FakeOpenRouter(mock)
        sites.mount(mock)
        yield Live(fake, sites, resolved)
    client.reset_spend_cache()
