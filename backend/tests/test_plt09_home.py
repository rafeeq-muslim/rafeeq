"""PLT-09 the organized home: the server setting and the model's order (R4).

The provider is never called: OpenRouter is replaced by scripted replies
(tests/knw_fakes.py), and respx refuses any other host."""

import pytest

from app.core.config import get_settings
from app.learning import content
from app.platform.home import MAIN, OPTIONAL, check_order
from tests.conftest import with_roles

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

LESSON = {
    "title": {"en": "Pillars of Islam"},
    "cards": [{"id": "p1-c1", "text": {"en": "TEST_CARD_TEXT"}}],
    "objectives": [{"id": "p1-o1", "text": {"en": "Names the five pillars"}, "label": {"en": "The five pillars"}, "cards": ["p1-c1"]}],
    "exercises": [],
}
SUMMARY = {"lang": "en", "bucket": "evening", "mastered": ["p1-o1"], "next": {"lesson_id": "p1"}}
MODEL_ORDER = {"main": ["daily", "card", "ask"], "optional": ["library", "reciter", "human", "save", "ramadan"]}


@pytest.fixture
def seed(monkeypatch):
    s = content.ContentStore(
        units=[{"id": "tu", "order": 1, "title": {"en": "TEST_UNIT"}, "lessons": ["p1"]}],
        lessons={"p1": {**LESSON, "id": "p1", "unit": "tu", "order": 1}},
    )
    monkeypatch.setattr(content, "store", lambda: s)


@pytest.fixture
def on(monkeypatch):
    monkeypatch.setattr(get_settings(), "plt09_organized_home", True)


# --- the setting -------------------------------------------------------------


async def test_plt09_setting_is_off_by_default(client):
    assert get_settings().plt09_organized_home is False
    assert (await client.get("/api/home/config")).json() == {"organized": False}


async def test_plt09_setting_on_is_reported(client, on):
    assert (await client.get("/api/home/config")).json() == {"organized": True}


async def test_plt09_setting_off_never_calls_the_model(client, ai, seed):
    ai.on("home_order", MODEL_ORDER)
    r = await client.post("/api/home/order", json=SUMMARY)
    assert r.json() == {"order": None}
    assert ai.calls == []


async def test_plt09_setting_off_team_preview_gets_the_order(client, ai, seed):
    token = await with_roles(client, "team-1", "team")
    ai.on("home_order", MODEL_ORDER)
    r = await client.post("/api/home/order", json=SUMMARY, headers={"Authorization": f"Bearer {token}"})
    assert r.json()["order"] == MODEL_ORDER


# --- R4 ----------------------------------------------------------------------


async def test_plt09_r4_model_orders_main_and_whole_optional_list_from_summary_and_time(client, ai, seed, on):
    """R4 ex1: Daniel is in «Pillars of Islam» and it is evening; the model may put
    «يومي» before «بطاقة اليوم» and «من المكتبة» before «اختر قارئك»."""
    ai.on("home_order", MODEL_ORDER)
    r = await client.post("/api/home/order", json=SUMMARY)
    order = r.json()["order"]
    assert order["main"].index("daily") < order["main"].index("card")
    assert order["optional"].index("library") < order["optional"].index("reciter")
    assert sorted(order["optional"]) == sorted(OPTIONAL)  # the whole list; the device keeps two
    sent = next(b for a, b in ai.calls if a == "home_order")["messages"][1]["content"]
    assert "TIME OF DAY: evening" in sent and "Pillars of Islam" in sent and "The five pillars" in sent
    assert "TEST_CARD_TEXT" not in sent  # names only, no lesson content


@pytest.mark.parametrize(
    "bad",
    [
        {"main": ["daily", "card", "prayer"], "optional": []},  # unknown id
        {"main": ["daily", "card"], "optional": ["human"]},  # dropped «اسأل رفيق»
        {"main": ["daily", "card", "ask", "ask"], "optional": []},  # a main one twice
        {"main": ["next", "daily", "card", "ask"], "optional": []},  # the next step is not the model's
        {"main": ["daily", "card", "ask"], "optional": ["library", "dhikr_counter"]},  # unknown optional
        {"main": ["daily", "card", "ask"], "optional": ["human", "human"]},
    ],
)
async def test_plt09_r4_invalid_output_is_refused_and_fixed_order_follows(client, ai, seed, on, bad):
    """R4 ex2: an unknown id or a dropped «اسأل رفيق» is refused → null → the app's fixed order."""
    ai.on("home_order", bad)
    assert (await client.post("/api/home/order", json=SUMMARY)).json() == {"order": None}


async def test_plt09_r4_outage_gives_null_without_error(client, ai, seed, on):
    ai.always("home_order", 503)
    r = await client.post("/api/home/order", json=SUMMARY)
    assert r.status_code == 200 and r.json() == {"order": None}


@pytest.mark.parametrize(
    "extra",
    [
        {"opened": ["adhkar"]},
        {"dismissed": ["save"]},
        {"lat": 21.4, "lng": 39.8},
        {"city": "Riyadh"},
        {"next_prayer": "asr"},
        {"habits": ["fajr"]},
    ],
)
async def test_plt09_r4_nothing_opened_dismissed_worship_or_location_enters(client, ai, seed, on, extra):
    """R4 «ما لا يدخل» and R2 ex3 (privacy): the request refuses any field beyond the
    learning summary, the bucket and the language; the model is not called."""
    r = await client.post("/api/home/order", json={**SUMMARY, **extra})
    assert r.status_code == 422
    assert ai.calls == []


async def test_plt09_r4_bucket_is_one_of_six(client, ai, seed, on):
    r = await client.post("/api/home/order", json={**SUMMARY, "bucket": "17:42"})
    assert r.status_code == 422


def test_plt09_r4_partial_optional_list_is_completed_in_table_order():
    out = check_order({"main": ["ask", "daily", "card"], "optional": ["library"]})
    assert out == {"main": ["ask", "daily", "card"], "optional": ["library", *[o for o in OPTIONAL if o != "library"]]}
    assert set(MAIN) == {"daily", "card", "ask"}
