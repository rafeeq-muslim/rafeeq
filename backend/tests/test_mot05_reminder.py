"""MOT-05 gentle reminder: one test per example."""

from datetime import UTC, datetime

from app.platform.models import PushSubscription
from app.platform.push import REMINDER_TEXT, due

SUB = "https://fcm.googleapis.com/fcm/send/abc"


def sub(**kw) -> PushSubscription:
    base = dict(endpoint=SUB, p256dh="k", auth="a", reminder_enabled=True, reminder_time="21:00", timezone="Asia/Riyadh", ignored_in_row=0)
    return PushSubscription(**{**base, **kw})


def riyadh(day: int, hh: int, mm: int = 0) -> datetime:
    return datetime(2026, 10, day, hh - 3, mm, tzinfo=UTC)  # Riyadh is UTC+3


def test_mot05_r1_one_reminder_at_the_chosen_time():
    assert due(sub(), riyadh(10, 20, 55))[0] is False
    assert due(sub(), riyadh(10, 21, 0))[0] is True


def test_mot05_r1_off_until_turned_on():
    assert due(sub(reminder_enabled=False), riyadh(10, 22))[0] is False
    assert due(sub(reminder_time=None), riyadh(10, 22))[0] is False


def test_mot05_r2_no_reminder_on_a_day_already_learned():
    assert due(sub(last_learned_on="2026-10-10"), riyadh(10, 21))[0] is False


def test_mot05_r2_at_most_one_a_day():
    assert due(sub(last_reminder_on="2026-10-10"), riyadh(10, 23))[0] is False


def test_mot05_r3_text_is_neutral():
    banned = ["رفيق", "Rafeeq", "الله", "Allah", "صلا", "pray", "Islam", "إسلام", "streak", "سلسلة", "days", "أيام", "missed"]
    for title, body in REMINDER_TEXT.values():
        for word in banned:
            assert word.lower() not in (title + body).lower()


def test_mot05_r4_three_ignored_means_every_other_day():
    s = sub(last_reminder_on="2026-10-09", ignored_in_row=2, last_learned_on="2026-10-05")
    assert due(s, riyadh(10, 21)) == (False, 3)
    assert due(s, riyadh(11, 21)) == (True, 3)


def test_mot05_r4_six_ignored_means_weekly():
    s = sub(last_reminder_on="2026-10-10", ignored_in_row=5, last_learned_on="2026-10-01")
    assert due(s, riyadh(16, 21))[0] is False
    assert due(s, riyadh(17, 21)) == (True, 6)


def test_mot05_r4_learning_brings_it_back_to_daily():
    s = sub(last_reminder_on="2026-10-10", ignored_in_row=7, last_learned_on="2026-10-11")
    assert due(s, riyadh(12, 21)) == (True, 0)


async def test_mot05_r1_reminder_settings_api(client):
    body = {
        "install_id": "dev-12345678",
        "subscription": {"endpoint": SUB, "keys": {"p256dh": "k", "auth": "a"}},
        "locale": "en",
        "timezone": "Asia/Manila",
    }
    assert (await client.post("/api/push/subscribe", json=body)).status_code == 204
    assert (await client.put("/api/push/reminder", json={"endpoint": SUB, "enabled": True})).status_code == 422
    r = await client.put("/api/push/reminder", json={"endpoint": SUB, "enabled": True, "time": "21:00"})
    assert r.json() == {"enabled": True, "time": "21:00"}
    assert (await client.put("/api/push/reminder", json={"endpoint": SUB, "enabled": False})).json()["enabled"] is False


async def test_push_endpoint_must_be_a_known_push_service(client):
    body = {"install_id": "dev-12345678", "subscription": {"endpoint": "https://attacker.example/x", "keys": {"p256dh": "k", "auth": "a"}}}
    assert (await client.post("/api/push/subscribe", json=body)).status_code == 422
    body["subscription"]["endpoint"] = "https://evil.fcm.googleapis.com.attacker.example/x"
    assert (await client.post("/api/push/subscribe", json=body)).status_code == 422
