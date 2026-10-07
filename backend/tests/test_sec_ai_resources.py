"""Security audit 2026-10-07, scope A: L1 (budget hold), M1 (no database
connection across slow calls, bounded AI requests and notifications), M5
(Argon2 off the event loop), L2 and L7 (deadline and server flags).
Model calls are scripted (tests/knw_fakes.py); no network."""

import asyncio
import threading
import uuid
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update

from app.companion import notify
from app.core import pwhash, security
from app.core.config import Settings, get_settings
from app.core.db import SessionLocal, engine
from app.knowledge import ask, library_search
from app.knowledge.ai import client as ai_client
from app.knowledge.ai import gate
from app.knowledge.ai.errors import BudgetExceeded
from app.knowledge.live_sources.orchestrator import Collection
from app.main import app
from app.platform import push
from app.platform.models import User
from tests.conftest import auth, register
from tests.knw_fakes import add_passages
from tests.test_sec_ai_limits import EXPLAIN, GUIDE, ORDER, SUPPORTED
from tests.test_sec_ai_limits import seed as seed  # noqa: F401  (fixture: one dummy lesson)

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

SHAHADA = {
    "id": "hadeethenc:en:101",
    "lang": "en",
    "quote_text": "TEST_QUOTE_TEXT la ilaha illa allah",
    "context_text": "TEST_CONTEXT_TEXT meaning of the shahada none deserves worship",
}
ANSWER = {
    "sufficient": True,
    "answer": "It means that nothing deserves worship except Allah. {{q:hadeethenc:en:101}}",
    "sources": ["hadeethenc:en:101"],
}
QUESTION = {"question": "What does la ilaha illa allah mean?", "lang": "en"}
ENDPOINT = "https://fcm.googleapis.com/fcm/send/TEST_SEC_ENDPOINT"


# --- L1: the budget check holds the call's cost until it is recorded ---------------


async def test_sec_l1_calls_sent_together_cannot_all_pass_the_budget_check(ai, monkeypatch):
    st = get_settings()
    model, system, user, max_tokens = st.ai_model_fast, "s" * 400, "u" * 400, 1000
    pin, pout = ai_client.PRICES[model]
    one_call = (800 / 2 * pin + max_tokens * pout) / 1e6  # the most one such call can cost
    monkeypatch.setattr(st, "ai_daily_budget_usd", ai_client.MARGIN_USD + 2.5 * one_call)  # room for two
    sent = 0

    async def slow_post(path, body, timeout_s):
        nonlocal sent
        sent += 1
        await asyncio.sleep(0.05)
        return {"choices": [{"message": {"content": "ok"}}], "usage": {"prompt_tokens": 200, "completion_tokens": 1000}}

    monkeypatch.setattr(ai_client, "_post", slow_post)
    calls = [ai_client.complete("router", model, system, user, json_mode=False, max_tokens=max_tokens) for _ in range(20)]
    results = await asyncio.gather(*calls, return_exceptions=True)
    assert sent == 2  # was 20: every call saw the same "nothing spent yet"
    assert sum(isinstance(r, BudgetExceeded) for r in results) == 18
    assert ai_client._reserved == {False: 0.0, True: 0.0}  # every hold was settled
    with pytest.raises(BudgetExceeded):  # and the real cost now counts
        await ai_client.complete("router", model, system, user, json_mode=False, max_tokens=max_tokens)


async def test_sec_l1_a_failed_call_gives_its_hold_back(ai):
    ai.always("router", 503)
    with pytest.raises(ai_client._CallFailed):
        await ai_client.complete("router", get_settings().ai_model_fast, "# Rafeeq router", "u", json_mode=True, max_tokens=40)
    assert ai_client._reserved == {False: 0.0, True: 0.0}


# --- M1: no database connection is held across a model or network call ----------------


@pytest.fixture
def held(monkeypatch):
    """Connections checked out of the pool at the moment each model call is sent."""
    seen: list[int] = []
    real = ai_client._post

    async def post(path, body, timeout_s):
        seen.append(engine.pool.checkedout())
        return await real(path, body, timeout_s)

    monkeypatch.setattr(ai_client, "_post", post)
    return seen


@pytest.fixture
async def learner(client):
    """A signed-in learner: reading the account opens the request's session."""
    return auth((await register(client))["access_token"])


async def test_sec_m1_explain_holds_no_connection_while_the_model_works(client, ai, seed, held, learner):  # noqa: F811
    text = "The intention is made in the heart."
    ai.on("explainer", {"text": text}).on("support", SUPPORTED)
    r = await client.post("/api/learning/explain", json=EXPLAIN, headers=learner)
    assert r.json() == {"text": text}
    assert held == [0, 0]


async def test_sec_m1_guide_holds_no_connection_while_the_model_works(client, ai, seed, held, learner):  # noqa: F811
    ai.on("guide", {"text": "Well done."}).on("support", SUPPORTED)
    r = await client.post("/api/learning/guide", json=GUIDE, headers=learner)
    assert r.json() == {"text": "Well done."}
    assert held == [0, 0]


async def test_sec_m1_home_order_holds_no_connection_while_the_model_works(client, ai, seed, held, learner):  # noqa: F811
    ai.on("home_order", {"main": ["daily", "card", "ask"], "optional": []})
    r = await client.post("/api/home/order", json=ORDER, headers=learner)
    assert r.json()["order"]["main"] == ["daily", "card", "ask"]
    assert held == [0]


async def test_sec_m1_ask_holds_no_connection_during_any_model_call(client, ai, seed, held, learner):  # noqa: F811
    await add_passages(SHAHADA)
    ai.on("router", {"route": "general", "level": "A"}).on("composer", ANSWER).on("support", SUPPORTED)
    ai.on("tagger", {"objective_id": "t1-o1"})
    r = await client.post("/api/ask", json={**QUESTION, "consent_objectives": True}, headers=learner)
    assert r.json()["outcome"] == "answered" and r.json()["objective_id"] == "t1-o1"
    assert ai.agents_called() == ["router", "embed", "composer", "support", "tagger"]
    assert held == [0, 0, 0, 0, 0]


async def test_sec_m1_ask_holds_no_connection_while_live_sources_are_read(client, ai, held, learner, monkeypatch):
    await add_passages(SHAHADA)
    ai.on("router", {"route": "general", "level": "A"}).on("composer", ANSWER).on("support", SUPPORTED)
    at_end: list[int] = []

    async def collect(question, canonical, lang, ask_id, window):
        # The sites are slow: they are still being read once the local search
        # has finished. From then on the request must hold no connection.
        for _ in range(60):
            await asyncio.sleep(0.05)
            if engine.pool.checkedout() == 0:
                break
        at_end.append(engine.pool.checkedout())
        return Collection()

    monkeypatch.setattr(ask.live_registry, "live_on", lambda: True)
    monkeypatch.setattr(ask.live_registry, "enabled", lambda: [])
    monkeypatch.setattr(ask.live_orchestrator, "collect", collect)
    r = await client.post("/api/ask", json=QUESTION, headers=learner)
    assert r.json()["outcome"] == "answered"
    assert at_end == [0] and set(held) == {0}


async def test_sec_m1_library_search_holds_no_connection_while_sites_are_searched(client, learner, monkeypatch):
    during: list[int] = []

    async def search(**kw):
        during.append(engine.pool.checkedout())
        return {"search_id": None, "status": "success", "items": [], "source_status": [], "next_cursor": None}

    monkeypatch.setattr(get_settings(), "library_search_enabled", True)
    monkeypatch.setattr(library_search, "search", search)
    r = await client.post("/api/discover/library/search", json={"query": "TEST_QUERY", "lang": "en"}, headers=learner)
    assert r.status_code == 200 and during == [0]


def test_sec_m1_a_request_waits_only_seconds_for_a_connection():
    assert engine.pool.timeout() <= 5


# --- M1: a bounded number of AI-backed requests at once -----------------------------


async def test_sec_m1_gate_bounds_concurrent_requests_and_frees_places(monkeypatch):
    st = get_settings()
    monkeypatch.setattr(st, "ai_max_concurrent_requests", 1)
    monkeypatch.setattr(st, "ai_gate_wait_seconds", 0.05)
    async with gate.slot("a"):
        assert gate.running() == 1
        with pytest.raises(gate.Busy):
            async with gate.slot("b"):
                pass
    assert gate.running() == 0
    async with gate.slot("b"):  # the place is free again
        pass

    monkeypatch.setattr(st, "ai_gate_wait_seconds", 2.0)

    async def short():
        async with gate.slot("a"):
            await asyncio.sleep(0.05)

    task = asyncio.create_task(short())
    await asyncio.sleep(0)
    async with gate.slot("b"):  # waits for the place instead of failing
        assert task.done()
    await task


async def test_sec_m1_one_client_cannot_hold_every_place(monkeypatch):
    st = get_settings()
    monkeypatch.setattr(st, "ai_max_concurrent_requests", 4)
    monkeypatch.setattr(st, "ai_max_concurrent_per_client", 2)
    async with gate.slot("a"), gate.slot("a"):
        with pytest.raises(gate.Busy):
            async with gate.slot("a"):
                pass
        async with gate.slot("b"):  # another client still gets in
            assert gate.running() == 3
    assert gate.running() == 0 and gate._per_client == {}


async def test_sec_m1_busy_gate_gives_the_fallback_not_an_error(client, ai, seed, monkeypatch):  # noqa: F811
    st = get_settings()
    monkeypatch.setattr(st, "ai_max_concurrent_requests", 1)
    monkeypatch.setattr(st, "ai_gate_wait_seconds", 0.05)
    ai.always("explainer", {"text": "The intention is made in the heart."}).always("support", SUPPORTED)
    async with gate.slot("someone-else"):
        r = await client.post("/api/learning/explain", json=EXPLAIN)
        assert r.status_code == 200 and r.json() == {"text": None}
        r = await client.post("/api/ask", json=QUESTION)
        assert r.status_code == 200 and r.json()["reason_code"] == "temporarily_unavailable"
        assert ai.calls == []
        danger = await client.post("/api/ask", json={"question": "They beat me at home", "lang": "en"})
        assert danger.json()["outcome"] == "danger"  # rules.md §2.8
    assert (await client.post("/api/learning/explain", json=EXPLAIN)).json()["text"]


# --- M1: notifications are bounded and send without a connection -------------------


async def _subscribe(client, headers) -> None:
    body = {"install_id": "dev-12345678", "subscription": {"endpoint": ENDPOINT, "keys": {"p256dh": "k", "auth": "a"}}, "locale": "en"}
    assert (await client.post("/api/push/subscribe", json=body, headers=headers)).status_code == 204
    assert (await client.put("/api/push/replies", json={"endpoint": ENDPOINT, "enabled": True})).json() == {"enabled": True}


async def test_sec_m1_a_notification_holds_no_connection_while_it_is_sent(client, monkeypatch):
    out = await register(client)
    await _subscribe(client, auth(out["access_token"]))
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.username == "layla-1").values(roles=["team"]))
        await s.commit()
    during: list[int] = []

    async def send(sub, payload):
        during.append(engine.pool.checkedout())
        return True

    monkeypatch.setattr(push, "send", send)
    for args in (  # one at a time: only the sender's own session could hold a connection
        (notify.to_user, uuid.UUID(out["user"]["id"]), "reply", "/mentor"),
        (notify.to_role, ["team"], "report", "/inbox"),
        (notify.to_endpoint, ENDPOINT, "reply", "en", "/mentor"),
    ):
        notify.later(*args)
        await notify.drain()
    assert during == [0, 0, 0]


async def test_sec_m1_notifications_run_a_few_at_a_time_and_do_not_pile_up(monkeypatch):
    running = peak = done = 0

    async def slow(session):
        nonlocal running, peak, done
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.02)
        running -= 1
        done += 1

    for _ in range(20):
        notify.later(slow)
    await notify.drain()
    assert done == 20 and peak <= notify.MAX_SENDING  # was 20 at once, each with its own connection

    monkeypatch.setattr(notify, "MAX_WAITING", 3)
    done = 0
    for _ in range(10):
        notify.later(slow)
    await notify.drain()
    assert done == 3  # past the bound a notification is dropped (and logged), not queued without limit


# --- M5: Argon2 runs off the event loop ------------------------------------------------


async def test_sec_m5_sign_in_and_password_change_hash_off_the_event_loop(client, monkeypatch):
    loop_thread = threading.current_thread()
    where: list[tuple[str, bool]] = []
    real_hash, real_verify = security.hash_password, security.verify_password

    def hash_password(password):
        where.append(("hash", threading.current_thread() is loop_thread))
        return real_hash(password)

    def verify_password(password_hash, password):
        where.append(("verify", threading.current_thread() is loop_thread))
        return real_verify(password_hash, password)

    monkeypatch.setattr(security, "hash_password", hash_password)
    monkeypatch.setattr(security, "verify_password", verify_password)
    out = await register(client)
    ok = await client.post("/api/auth/login", json={"username": "layla-1", "password": "pass-1234-word"})
    assert ok.status_code == 200
    bad = await client.post("/api/auth/login", json={"username": "layla-1", "password": "wrong-password"})
    unknown = await client.post("/api/auth/login", json={"username": "nobody-9", "password": "wrong-password"})
    assert bad.status_code == unknown.status_code == 401
    r = await client.post(
        "/api/me/password",
        json={"current_password": "pass-1234-word", "new_password": "new-pass-5678-word"},
        headers=auth(out["access_token"]),
    )
    assert r.status_code == 204
    assert [name for name, _ in where] == ["hash", "verify", "verify", "verify", "verify", "hash"]
    assert not any(on_loop for _, on_loop in where)


async def test_sec_m5_only_a_few_hashes_run_at_once(monkeypatch):
    lock = threading.Lock()
    running = peak = 0

    def verify_password(password_hash, password):
        nonlocal running, peak
        with lock:
            running += 1
            peak = max(peak, running)
        threading.Event().wait(0.02)
        with lock:
            running -= 1
        return True

    monkeypatch.setattr(security, "verify_password", verify_password)
    assert all(await asyncio.gather(*[pwhash.verify_password("h", "p") for _ in range(12)]))
    assert peak <= pwhash.MAX_CONCURRENT


async def test_sec_m5_the_loop_keeps_serving_while_a_password_is_checked(monkeypatch):
    """A slow check (here 1 s) does not stop another request from being answered."""

    def verify_password(password_hash, password):
        threading.Event().wait(1.0)
        return False

    monkeypatch.setattr(security, "verify_password", verify_password)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        login = asyncio.create_task(c.post("/api/auth/login", json={"username": "nobody-9", "password": "wrong-password"}))
        await asyncio.sleep(0.05)
        health = await asyncio.wait_for(c.get("/api/health"), 0.7)
        assert health.status_code == 200 and not login.done()
        assert (await login).status_code == 401


# --- L2, L7 -----------------------------------------------------------------------------


def test_sec_l2_live_ask_deadline_is_under_the_host_routers_60_seconds():
    st = Settings(_env_file=None)
    assert st.ask_live_deadline_seconds < 60 and st.ask_deadline_seconds < 60


def test_sec_l7_production_server_bounds_connections_and_stays_one_process():
    compose = (Path(__file__).resolve().parents[2] / "infra" / "compose.prod.yml").read_text(encoding="utf-8")
    command = next(line for line in compose.splitlines() if "uvicorn app.main:app" in line)
    assert "--limit-concurrency " in command and "--timeout-keep-alive " in command
    assert "--workers" not in command  # in-memory limiters and jobs assume one process
