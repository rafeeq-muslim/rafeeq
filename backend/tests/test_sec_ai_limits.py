"""Security audit 2026-10-07, scope A, finding H3 (+ L5): limits on AI-backed
requests. Addresses are documentation ranges (RFC 5737, RFC 3849); model
calls are scripted (tests/knw_fakes.py); no network."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core import clientkey, limits
from app.core.config import get_settings
from app.knowledge import library_search
from app.knowledge.ai import gate
from app.learning import content
from app.main import app
from tests.conftest import auth, register
from tests.test_knw06_library_search import Q, ih_item
from tests.test_knw06_library_search import sites as sites  # noqa: F401  (fixture: the two library sites, mocked)

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

DANGER = "They beat me at home"  # a danger phrase: answered without any model call
LESSON = {
    "title": {"en": "TEST_LESSON_ONE"},
    "cards": [{"id": "t1-c1", "text": {"en": "TEST_CARD_TEXT the intention is made in the heart."}}],
    "objectives": [{"id": "t1-o1", "text": {"en": "Knows where the intention is made"}, "cards": ["t1-c1"]}],
    "exercises": [
        {
            "id": "t1-e1",
            "type": "choose",
            "objectives": ["t1-o1"],
            "cards": ["t1-c1"],
            "prompt": {"en": "Where is the intention made?"},
            "options": [{"id": "a", "text": {"en": "In the heart"}}, {"id": "b", "text": {"en": "With the tongue"}}],
            "answer": "a",
        }
    ],
}
EXPLAIN = {"lesson_id": "t1", "exercise_id": "t1-e1", "lang": "en", "answer": "b"}
GUIDE = {"lang": "en", "mastered": ["t1-o1"]}
ORDER = {"lang": "en", "bucket": "evening", "mastered": ["t1-o1"]}
SUPPORTED = {"supported": True, "unsupported": []}
ASK = {"question": DANGER, "lang": "en"}
LIB = {"query": Q, "lang": "ar"}
LIB_URL = "/api/discover/library/search"


def at(address: str) -> AsyncClient:
    """A client whose requests arrive from `address`."""
    return AsyncClient(transport=ASGITransport(app=app, client=(address, 40000)), base_url="http://test")


@pytest.fixture
def seed(monkeypatch):
    s = content.ContentStore(
        units=[{"id": "tu", "order": 1, "title": {"en": "TEST_UNIT"}, "lessons": ["t1"]}],
        lessons={"t1": {**LESSON, "id": "t1", "unit": "tu", "order": 1}},
    )
    monkeypatch.setattr(content, "store", lambda: s)


# --- the shared client key ------------------------------------------------------


@pytest.mark.parametrize(
    ("host", "key"),
    [
        ("203.0.113.7", "203.0.113.7"),
        ("2001:db8:1:2::1", "2001:db8:1:2::/64"),
        ("2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2::/64"),
        ("2001:db8:1:3::1", "2001:db8:1:3::/64"),
        ("::ffff:203.0.113.7", "203.0.113.7"),  # IPv4-mapped: the IPv4 client
        ("fe80::1%eth0", "fe80::/64"),
        (None, "-"),
        ("testclient", "testclient"),
    ],
)
def test_sec_h3_address_key_groups_an_ipv6_64(host, key):
    assert clientkey.address_key(host) == key


async def test_sec_h3_ipv6_addresses_of_one_64_share_one_allowance():
    async with at("2001:db8:1:2::1") as a, at("2001:db8:1:2:aaaa:bbbb:cccc:dddd") as b, at("2001:db8:1:3::1") as other:
        for _ in range(8):
            assert (await a.post("/api/ask", json=ASK)).status_code == 200
        assert (await b.post("/api/ask", json=ASK)).status_code == 429  # same /64: the same client
        assert (await other.post("/api/ask", json=ASK)).status_code == 200  # another /64


# --- both the address and the account ---------------------------------------------

LIMITED = [  # route, body, per-minute limit
    ("/api/ask", ASK, 8),
    ("/api/learning/explain", EXPLAIN, 20),
    ("/api/learning/guide", GUIDE, 20),
    ("/api/home/order", ORDER, 10),
]


@pytest.mark.parametrize(("url", "body", "limit"), LIMITED)
async def test_sec_h3_two_accounts_on_one_address_share_the_address_allowance(url, body, limit):
    """A second free account does not buy a second allowance."""
    async with at("203.0.113.7") as c:
        one = auth((await register(c, username="layla-1"))["access_token"])
        two = auth((await register(c, username="layla-2"))["access_token"])
        for _ in range(limit):
            assert (await c.post(url, json=body, headers=one)).status_code == 200
        assert (await c.post(url, json=body, headers=two)).status_code == 429
        assert (await c.post(url, json=body)).status_code == 429  # nor does signing out


@pytest.mark.parametrize(("url", "body", "limit"), LIMITED)
async def test_sec_h3_one_account_on_two_addresses_keeps_one_allowance(url, body, limit):
    """Nor does a second address buy an account a second allowance."""
    async with at("203.0.113.7") as c, at("198.51.100.9") as elsewhere:
        one = auth((await register(c, username="layla-1"))["access_token"])
        for _ in range(limit):
            assert (await c.post(url, json=body, headers=one)).status_code == 200
        assert (await elsewhere.post(url, json=body, headers=one)).status_code == 429
        assert (await elsewhere.post(url, json=body)).status_code == 200  # a guest there is another client


async def test_sec_l5_library_search_is_limited_by_address_and_account(sites):  # noqa: F811
    sites.ih["ar"] = [ih_item(1)]
    async with at("203.0.113.7") as c, at("198.51.100.9") as elsewhere:
        one = auth((await register(c, username="layla-1"))["access_token"])
        two = auth((await register(c, username="layla-2"))["access_token"])
        for _ in range(20):
            assert (await c.post(LIB_URL, json=LIB, headers=one)).status_code == 200
        for client, headers in ((c, two), (elsewhere, one)):
            r = await client.post(LIB_URL, json=LIB, headers=headers)
            assert r.status_code == 429 and r.headers["cache-control"] == "no-store"


# --- one client over its places degrades, never errors -------------------------------
# Owner decision 2026-10-10 (plt-admin-limits): the global per-minute cap is
# gone (tests/test_plt_admin_limits.py); the per-client places remain.


async def test_sec_h3_a_client_over_its_places_gets_fallbacks_without_a_model_call(ai, seed):
    limits.override("ai_concurrent_per_client", 1)
    ai.always("explainer", {"text": "The intention is made in the heart."}).always("support", SUPPORTED)
    async with at("203.0.113.1") as a, at("203.0.113.2") as b, at("203.0.113.3") as c, gate.slot("a:203.0.113.3"):
        assert (await a.post("/api/learning/explain", json=EXPLAIN)).json()["text"]
        assert (await b.post("/api/learning/explain", json=EXPLAIN)).json()["text"]
        calls = len(ai.calls)
        # c already has a request running: every AI-backed route answers 200 with its fallback
        r = await c.post("/api/learning/explain", json=EXPLAIN)
        assert r.status_code == 200 and r.json() == {"text": None}
        r = await c.post("/api/learning/guide", json=GUIDE)
        assert r.status_code == 200 and r.json() == {"text": None}
        r = await c.post("/api/home/order", json=ORDER)
        assert r.status_code == 200 and r.json() == {"order": None}
        r = await c.post("/api/ask", json={"question": "What is the shahada?", "lang": "en"})
        out = r.json()
        assert r.status_code == 200 and (out["outcome"], out["reason_code"], out["retryable"]) == (
            "unavailable",
            "temporarily_unavailable",
            True,
        )
        assert out["should_escalate"] is True  # «أريد إنسانًا» is still offered
        assert len(ai.calls) == calls  # no paid call past the limit
        # rules.md §2.8: a danger message is never held back by the limit
        r = await c.post("/api/ask", json=ASK)
        assert r.json()["outcome"] == "danger" and r.json()["handoff"]["kind"] == "urgent"


# --- a call budget per request ------------------------------------------------------


async def test_sec_h3_explain_costs_at_most_four_paid_calls(client, ai, seed):
    """Was 8: the writer's retry and fallback (4), then the checker's (4)."""
    ai.on("explainer", "not json", "not json", "not json", {"text": "The intention is made in the heart."})
    ai.always("support", "not json")
    r = await client.post("/api/learning/explain", json=EXPLAIN)
    assert r.status_code == 200 and r.json() == {"text": None}
    assert len(ai.calls) == 4


async def test_sec_h3_guide_costs_at_most_four_paid_calls(client, ai, seed):
    ai.on("guide", "not json", "not json", "not json", {"text": "You have learned one thing."})
    ai.always("support", "not json")
    r = await client.post("/api/learning/guide", json=GUIDE)
    assert r.status_code == 200 and r.json() == {"text": None}
    assert len(ai.calls) == 4


async def test_sec_h3_home_order_costs_at_most_two_paid_calls(client, ai, seed):
    """Was 4: two models, two attempts each."""
    ai.always("home_order", "not json")
    r = await client.post("/api/home/order", json=ORDER)
    assert r.status_code == 200 and r.json() == {"order": None}
    assert len(ai.calls) == 2


# --- L5: a global daily cap on outbound library searches ---------------------------


async def test_sec_l5_library_search_daily_cap_stops_outbound_calls(sites, monkeypatch):  # noqa: F811
    monkeypatch.setattr(get_settings(), "library_search_daily_cap", 2)
    sites.ih["ar"] = [ih_item(1)]
    async with at("203.0.113.1") as a, at("203.0.113.2") as b, at("203.0.113.3") as c:
        assert (await a.post(LIB_URL, json=LIB)).json()["items"]
        assert (await b.post(LIB_URL, json=LIB)).json()["items"]
        outbound = len(sites.calls)
        r = await c.post(LIB_URL, json=LIB)
        assert r.status_code == 503 and r.json()["detail"]["code"] == "sources_unavailable"
        assert r.headers["cache-control"] == "no-store"
        assert len(sites.calls) == outbound  # nothing left the server
    assert library_search._outbound_day[1] == 2
