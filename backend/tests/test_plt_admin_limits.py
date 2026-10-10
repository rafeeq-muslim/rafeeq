"""plt-admin-limits (owner decisions 2026-10-10):
- "These limits must be editable by superadmin": every abuse/traffic limit of
  the 2026-10-07 security work reads app.core.limits (code default unless the
  admin saved a value), through an admin-only API with bounds and an audit row.
- "We used OpenRouter to have an unlimited amount of concurrent users": no
  global AI cap or queue; many people asking at once all get real answers,
  while one client is still limited.
Model calls are scripted (tests/knw_fakes.py); no network."""

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select

from app.core import limits
from app.core.config import get_settings
from app.core.db import SessionLocal, engine
from app.knowledge.ai import client as ai_client
from app.knowledge.ai import gate
from app.main import app
from app.platform.models import User
from tests.conftest import auth, register, with_roles
from tests.knw_fakes import add_passages
from tests.test_sec_ai_limits import EXPLAIN, SUPPORTED
from tests.test_sec_ai_limits import seed as seed  # noqa: F401  (fixture: one dummy lesson)
from tests.test_sec_ai_resources import ANSWER, QUESTION, SHAHADA

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

URL = "/api/admin/limits"


def at(n: int) -> AsyncClient:
    """A client at its own address (one person on their own phone)."""
    host = f"198.51.{n // 250}.{n % 250 + 1}"
    return AsyncClient(transport=ASGITransport(app=app, client=(host, 40000)), base_url="http://test", timeout=60)


@pytest.fixture
async def admin(client):
    return auth(await with_roles(client, "admin-one", "admin"))


# --- the settings store: defaults, reads, cache ------------------------------------


async def test_limits_default_to_the_values_before_the_owner_decision(client, admin):
    rows = {r["key"]: r for r in (await client.get(URL, headers=admin)).json()}
    expected = {
        "report_hides_per_reporter_day": 5,
        "report_hides_per_author_day": 2,
        "org_links_per_code_day": 200,
        "ai_concurrent_per_client": 3,
        "ask_per_minute": 8,
        "ask_per_day": 120,
        "explain_per_minute": 20,
        "explain_per_day": 150,
        "guide_per_minute": 20,
        "guide_per_day": 60,
        "home_order_per_minute": 10,
        "home_order_per_day": 20,
        "ai_daily_budget_usd": get_settings().ai_daily_budget_usd,
        "ai_total_budget_usd": get_settings().ai_budget_usd,
        "urgent_repeat_minutes": 10,
        "urgent_pushes_per_hour": 20,
        "danger_alert_every_minutes": 30,
        "danger_alerts_per_address_hour": 3,
    }
    assert {k: r["value"] for k, r in rows.items()} == expected
    assert {k: r["default"] for k, r in rows.items()} == expected
    assert all(r["min"] <= r["value"] <= r["max"] for r in rows.values())
    assert rows["ai_daily_budget_usd"]["kind"] == "usd" and rows["ask_per_day"]["kind"] == "int"


async def test_a_saved_value_is_read_from_the_database_after_the_cache_ages(client, admin, monkeypatch):
    async with SessionLocal() as s:
        s.add(limits.LimitValue(key="ask_per_day", value=500))
        await s.commit()
    assert await limits.value("ask_per_day") == 500
    async with SessionLocal() as s:
        (await s.get(limits.LimitValue, "ask_per_day")).value = 700
        await s.commit()
    assert await limits.value("ask_per_day") == 500  # cached for TTL_S
    monkeypatch.setattr(limits, "TTL_S", 0.0)
    assert await limits.value("ask_per_day") == 700


async def test_many_reads_at_once_share_one_database_load(monkeypatch):
    loads = 0
    real = limits._load

    async def counting():
        nonlocal loads
        loads += 1
        await real()

    monkeypatch.setattr(limits, "_load", counting)
    await asyncio.gather(*(limits.value("ask_per_minute") for _ in range(50)))
    assert loads == 1


# --- the admin API ------------------------------------------------------------------


async def test_admin_changes_a_limit_and_it_is_audited_with_the_admin_id_only(client, admin):
    r = await client.put(f"{URL}/ask_per_day", json={"value": 300}, headers=admin)
    assert r.status_code == 200, r.text
    assert (r.json()["value"], r.json()["default"]) == (300, 120)
    assert limits.get("ask_per_day") == 300
    r = await client.delete(f"{URL}/ask_per_day", headers=admin)
    assert r.json()["value"] == 120
    async with SessionLocal() as s:
        admin_id = await s.scalar(select(User.id).where(User.username == "admin-one"))
        assert await s.get(limits.LimitValue, "ask_per_day") is None  # reset = no row
    changes = (await client.get("/api/admin/limit-changes", headers=admin)).json()
    assert [(c["key"], c["old"], c["new"]) for c in changes] == [("ask_per_day", 300, 120), ("ask_per_day", 120, 300)]
    assert {c["admin_id"] for c in changes} == {str(admin_id)}
    assert set(changes[0]) == {"key", "old", "new", "admin_id", "at"}


@pytest.mark.parametrize(
    ("key", "value", "code"),
    [
        ("ask_per_day", 0, "limit_out_of_range"),
        ("ask_per_day", 1_000_000, "limit_out_of_range"),
        ("ask_per_day", 2.5, "limit_not_integer"),
        ("urgent_pushes_per_hour", -1, "limit_out_of_range"),
        ("ai_daily_budget_usd", 5000, "limit_out_of_range"),
    ],
)
async def test_admin_values_are_validated(client, admin, key, value, code):
    r = await client.put(f"{URL}/{key}", json={"value": value}, headers=admin)
    assert r.status_code == 422 and r.json()["detail"] == code
    assert limits.get(key) == limits.default(key)


async def test_bad_bodies_and_unknown_limits_are_refused(client, admin):
    assert (await client.put(f"{URL}/ask_per_day", json={"value": "lots"}, headers=admin)).status_code == 422
    assert (await client.put(f"{URL}/no_such_limit", json={"value": 3}, headers=admin)).status_code == 404
    assert (await client.delete(f"{URL}/no_such_limit", headers=admin)).status_code == 404


async def test_a_budget_takes_cents(client, admin):
    r = await client.put(f"{URL}/ai_daily_budget_usd", json={"value": 2.5}, headers=admin)
    assert r.status_code == 200 and r.json()["value"] == 2.5


@pytest.mark.parametrize("roles", [(), ("team",), ("mentor",), ("sharia_reviewer",)])
async def test_only_the_admin_reads_or_changes_limits(client, roles):
    h = auth(await with_roles(client, "not-admin", "learner", *roles)) if roles else auth((await register(client))["access_token"])
    assert (await client.get(URL, headers=h)).status_code == 403
    assert (await client.put(f"{URL}/ask_per_day", json={"value": 1}, headers=h)).status_code == 403
    assert (await client.delete(f"{URL}/ask_per_day", headers=h)).status_code == 403
    assert (await client.get("/api/admin/limit-changes", headers=h)).status_code == 403
    assert (await client.get(URL)).status_code == 401
    assert limits.get("ask_per_day") == 120


# --- a changed limit takes effect ---------------------------------------------------


async def test_a_changed_ai_limit_takes_effect_at_once(client, admin, ai, seed):  # noqa: F811
    ai.always("explainer", {"text": "The intention is made in the heart."}).always("support", SUPPORTED)
    assert (await client.put(f"{URL}/explain_per_minute", json={"value": 2}, headers=admin)).status_code == 200
    async with at(1) as c:
        assert (await c.post("/api/learning/explain", json=EXPLAIN)).status_code == 200
        assert (await c.post("/api/learning/explain", json=EXPLAIN)).status_code == 200
        assert (await c.post("/api/learning/explain", json=EXPLAIN)).status_code == 429
        assert (await client.put(f"{URL}/explain_per_minute", json={"value": 3}, headers=admin)).status_code == 200
        assert (await c.post("/api/learning/explain", json=EXPLAIN)).status_code == 200


async def test_a_changed_daily_budget_takes_effect(client, admin, ai, seed):  # noqa: F811
    ai.always("explainer", {"text": "The intention is made in the heart."}).always("support", SUPPORTED)
    assert (await client.put(f"{URL}/ai_daily_budget_usd", json={"value": 0}, headers=admin)).status_code == 200
    assert (await client.post("/api/learning/explain", json=EXPLAIN)).json() == {"text": None}
    assert ai.calls == []  # no paid call past the ceiling
    assert (await client.delete(f"{URL}/ai_daily_budget_usd", headers=admin)).status_code == 200
    assert (await client.post("/api/learning/explain", json=EXPLAIN)).json()["text"]


async def test_a_changed_urgent_push_cap_takes_effect(client, admin):
    from app.companion import notify, urgent

    assert (await client.put(f"{URL}/urgent_pushes_per_hour", json={"value": 1}, headers=admin)).status_code == 200
    assert urgent.alert("request-1") == "all"
    assert urgent.alert("request-2") == "team"  # over the admin's cap: only the team hears
    notify._pending.clear()


# --- AI concurrency: no global cap, no queue (owner 2026-10-10) ----------------------


@pytest.fixture
def slow_model(monkeypatch):
    """Every model call takes 0.3 s at the provider. Counts the calls running at
    once and, per call, the connections its own request holds (A-M1: none)."""
    state = {"running": 0, "peak": 0, "own": 0}
    owner: dict[int, asyncio.Task | None] = {}

    def checkout(dbapi_conn, record, proxy):
        owner[id(record)] = asyncio.current_task()

    def checkin(dbapi_conn, record):
        owner.pop(id(record), None)

    pool = engine.sync_engine.pool
    event.listen(pool, "checkout", checkout)
    event.listen(pool, "checkin", checkin)
    real = ai_client._post

    async def post(path, body, timeout_s):
        me = asyncio.current_task()
        state["own"] = max(state["own"], sum(1 for t in owner.values() if t is me))
        state["running"] += 1
        state["peak"] = max(state["peak"], state["running"])
        try:
            await asyncio.sleep(0.3)
            return await real(path, body, timeout_s)
        finally:
            state["running"] -= 1

    monkeypatch.setattr(ai_client, "_post", post)
    yield state
    event.remove(pool, "checkout", checkout)
    event.remove(pool, "checkin", checkin)


async def test_a_hundred_people_asking_at_once_all_get_answers(ai, slow_model, monkeypatch):
    """Before: past 12 at once (2 s wait) or 120 a minute, people got the fixed
    «temporarily unavailable» reply. Now every one is answered, concurrently."""
    monkeypatch.setattr(get_settings(), "ai_daily_budget_usd", 100.0)  # money is not what is tested here
    await add_passages(SHAHADA)
    ai.always("router", {"route": "general", "level": "A"}).always("composer", ANSWER).always("support", SUPPORTED)
    n = 100
    clients = [at(i) for i in range(n)]
    try:
        rs = await asyncio.gather(*(c.post("/api/ask", json=QUESTION) for c in clients))
    finally:
        await asyncio.gather(*(c.aclose() for c in clients))
    outcomes = [(r.status_code, r.json().get("outcome"), r.json().get("reason_code")) for r in rs]
    assert all(o[:2] == (200, "answered") for o in outcomes), [o for o in outcomes if o[1] != "answered"][:5]
    assert slow_model["peak"] >= 50  # the model calls really ran together, not in a queue of 12
    assert slow_model["own"] == 0  # (A-M1) no request holds a connection while its model call runs
    assert gate.running() == 0


async def test_one_client_is_still_limited_while_others_are_served(ai, seed, monkeypatch):  # noqa: F811
    ai.always("explainer", {"text": "The intention is made in the heart."}).always("support", SUPPORTED)
    release = asyncio.Event()
    real = ai_client._post

    async def post(path, body, timeout_s):
        await release.wait()
        return await real(path, body, timeout_s)

    monkeypatch.setattr(ai_client, "_post", post)
    async with at(7) as abuser, at(8) as other:
        token = auth((await register(abuser, username="busy-one"))["access_token"])
        held = [asyncio.create_task(abuser.post("/api/learning/explain", json=EXPLAIN, headers=token)) for _ in range(3)]
        await asyncio.sleep(0.2)
        # a fourth at once from the same client: refused at once, no model call, no wait
        r = await abuser.post("/api/learning/explain", json=EXPLAIN, headers=token)
        assert r.status_code == 200 and r.json() == {"text": None}
        # another person is not held up by him
        other_task = asyncio.create_task(other.post("/api/learning/explain", json=EXPLAIN))
        await asyncio.sleep(0.1)
        release.set()
        assert (await other_task).json()["text"]
        assert all(r.json()["text"] for r in await asyncio.gather(*held))
        # and his per-minute allowance still counts (20 a minute by default)
        statuses = [(await abuser.post("/api/learning/explain", json=EXPLAIN, headers=token)).status_code for _ in range(20)]
        assert statuses.count(429) == 4  # 3 + 1 + 16 = 20 allowed, the rest refused


def test_the_model_connection_pool_is_not_a_hidden_queue():
    assert ai_client.HTTP_LIMITS.max_connections is None or ai_client.HTTP_LIMITS.max_connections >= 1000
    assert engine.pool.size() + engine.pool._max_overflow >= 40
