"""PLT-02 guest-to-account merge, LRN-02 progress union and MOT-02 streak merge."""

from tests.conftest import auth, register


async def test_lrn02_device_and_account_progress_are_united(client):
    token = (await register(client))["access_token"]
    h = auth(token)
    phone = {
        "completed": {"u01-l1": {"first": "2026-10-01T08:00:00Z", "last": "2026-10-03T08:00:00Z", "times": 2}},
        "unlockedUnits": ["u2"],
        "mastery": {"u01-l1-o1": {"p": 0.5, "seen": True, "answered": True, "lastAnswerAt": "2026-10-03T08:00:00Z", "checksDone": 0}},
    }
    laptop = {
        "completed": {
            "u01-l1": {"first": "2026-09-30T08:00:00Z", "last": "2026-10-02T08:00:00Z", "times": 1},
            "u01-l2": {"first": "2026-10-04T08:00:00Z", "last": "2026-10-04T08:00:00Z", "times": 1},
        },
        "mastery": {"u01-l1-o1": {"p": 0.9, "seen": True, "answered": True, "lastAnswerAt": "2026-10-02T08:00:00Z", "checksDone": 0}},
    }
    assert (await client.put("/api/me/learning", json=phone, headers=h)).status_code == 200
    merged = (await client.put("/api/me/learning", json=laptop, headers=h)).json()
    l1 = merged["completed"]["u01-l1"]
    assert l1["first"].startswith("2026-09-30") and l1["last"].startswith("2026-10-03") and l1["times"] == 2
    assert set(merged["completed"]) == {"u01-l1", "u01-l2"} and merged["unlockedUnits"] == ["u2"]
    assert merged["mastery"]["u01-l1-o1"]["p"] == 0.5  # the later answer wins


async def test_mot02_larger_set_of_days_wins(client):
    h = auth((await register(client))["access_token"])
    await client.put("/api/me/motivation", json={"days": ["2026-10-01", "2026-10-02", "2026-10-03"]}, headers=h)
    r = (await client.put("/api/me/motivation", json={"days": ["2026-10-04", "2026-10-05"]}, headers=h)).json()
    assert r["days"] == ["2026-10-01", "2026-10-02", "2026-10-03"]
    r = (await client.put("/api/me/motivation", json={"days": ["2026-10-0" + str(i) for i in range(1, 7)]}, headers=h)).json()
    assert len(r["days"]) == 6


async def test_mot03_badge_is_kept_once_with_the_earliest_date(client):
    h = auth((await register(client))["access_token"])
    await client.put("/api/me/motivation", json={"badges": {"days-7": {"id": "days-7", "earnedAt": "2026-10-09T10:00:00Z"}}}, headers=h)
    r = (
        await client.put("/api/me/motivation", json={"badges": {"days-7": {"id": "days-7", "earnedAt": "2026-10-08T10:00:00Z"}}}, headers=h)
    ).json()
    assert list(r["badges"]) == ["days-7"] and r["badges"]["days-7"]["earnedAt"].startswith("2026-10-08")


async def test_sync_needs_an_account(client):
    assert (await client.get("/api/me/learning")).status_code == 401
    assert (await client.put("/api/me/motivation", json={})).status_code == 401


async def test_naive_timestamps_are_rejected(client):
    h = auth((await register(client))["access_token"])
    bad = {"completed": {"u01-l1": {"first": "2026-10-01T08:00:00", "last": "2026-10-01T08:00:00", "times": 1}}}
    assert (await client.put("/api/me/learning", json=bad, headers=h)).status_code == 422
