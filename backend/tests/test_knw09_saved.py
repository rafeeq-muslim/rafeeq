"""KNW-09 saved items: account copy (R3–R5)."""

from tests.conftest import auth, register, with_roles

T1 = "2026-10-01T08:00:00+00:00"
T2 = "2026-10-03T08:00:00+00:00"


def _items(*refs, at=T1):
    return {"items": [{"kind": "card", "ref": r, "saved_at": at} for r in refs]}


async def test_knw09_r3_guest_items_move_to_account(client):
    token = (await register(client))["access_token"]
    r = await client.put("/api/me/saved", json=_items("c1", "c2", "c3", "c4"), headers=auth(token))
    assert r.status_code == 200
    assert sorted(i["ref"] for i in (await client.get("/api/me/saved", headers=auth(token))).json()["items"]) == ["c1", "c2", "c3", "c4"]


async def test_knw09_r3_merge_keeps_one_copy(client):
    token = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_items("c1", at=T2), headers=auth(token))
    merged = (await client.put("/api/me/saved", json=_items("c1", at=T1), headers=auth(token))).json()["items"]
    assert len(merged) == 1 and merged[0]["saved_at"].startswith("2026-10-01")


async def test_knw09_r4_saved_items_are_only_the_owners(client):
    layla = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_items("c1"), headers=auth(layla))
    mentor = await with_roles(client, "mentor-1", "mentor")
    assert (await client.get("/api/me/saved", headers=auth(mentor))).json()["items"] == []
    assert (await client.get("/api/me/saved")).status_code == 401


async def test_knw09_r5_delete_one_and_all(client):
    token = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_items("c1", "c2"), headers=auth(token))
    assert (await client.delete("/api/me/saved/card/c1", headers=auth(token))).status_code == 204
    assert [i["ref"] for i in (await client.get("/api/me/saved", headers=auth(token))).json()["items"]] == ["c2"]
    assert (await client.delete("/api/me/saved", headers=auth(token))).status_code == 204
    assert (await client.get("/api/me/saved", headers=auth(token))).json()["items"] == []


async def test_knw09_r5_deleting_account_deletes_saved(client):
    from sqlalchemy import func, select

    from app.core.db import SessionLocal
    from app.knowledge.models import SavedItem

    token = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_items("c1", "c2"), headers=auth(token))
    r = await client.request("DELETE", "/api/me", headers=auth(token), json={"password": "pass-1234-word"})
    assert r.status_code == 204, r.text
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(SavedItem)) == 0
