"""PLT-17 admin fixes: R11 (no admin drops their own admin role, Rafeeq keeps
an admin) and R12 (codes expire after seven days, an unused code can be
revoked, each code shows its status)."""

from datetime import UTC, datetime, timedelta

from tests.conftest import auth, register, with_roles


async def _id(client, admin: dict, username: str) -> str:
    return next(u["id"] for u in (await client.get(f"/api/admin/users?username={username}", headers=admin)).json())


async def test_plt17_r11_admin_cannot_remove_own_admin_role(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    await with_roles(client, "admin-2", "admin")  # another admin exists: still refused
    me = await _id(client, admin, "admin-1")
    r = await client.put(f"/api/admin/users/{me}/roles", json={"roles": ["learner"]}, headers=admin)
    assert r.status_code == 409 and r.json()["detail"] == "cannot_remove_own_admin"
    still = (await client.get("/api/admin/users?username=admin-1", headers=admin)).json()[0]["roles"]
    assert "admin" in still


async def test_plt17_r11_last_admin_keeps_the_role(client):
    """Through the API the acting admin is always another admin, so this guard
    matters when two admins demote each other at once: call the handler with
    an acting admin who is no longer an admin in the database."""
    import uuid

    import pytest
    from fastapi import HTTPException

    from app.core.db import SessionLocal
    from app.platform.admin import RolesIn, set_roles
    from app.platform.models import User

    admin = auth(await with_roles(client, "admin-1", "admin"))
    last = await _id(client, admin, "admin-1")
    stale_actor = User(id=uuid.uuid4(), username="gone-admin", roles=["learner"])
    async with SessionLocal() as s:
        with pytest.raises(HTTPException) as e:
            await set_roles(uuid.UUID(last), RolesIn(roles=["learner"]), stale_actor, s)
    assert e.value.status_code == 409 and e.value.detail == "last_admin"


async def test_plt17_r11_other_role_changes_still_work(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    user = await register(client, username="layla-1")
    r = await client.put(f"/api/admin/users/{user['user']['id']}/roles", json={"roles": ["learner", "mentor"]}, headers=admin)
    assert r.status_code == 200 and r.json()["roles"] == ["learner", "mentor"]


async def test_plt17_r12_revoked_code_is_refused_at_sign_up(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    code = (await client.post("/api/admin/invites", json={"role": "admin"}, headers=admin)).json()["codes"][0]
    r = await client.post(f"/api/admin/invites/{code}/revoke", headers=admin)
    assert r.status_code == 200 and r.json()["status"] == "revoked"
    refused = await client.post(
        "/api/auth/register",
        json={"display_name": "نخلة", "username": "late-1", "password": "pass-1234-word", "invite_code": code},
    )
    assert refused.status_code == 400 and refused.json()["detail"] == "invite_invalid"


async def test_plt17_r12_used_code_cannot_be_revoked(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    code = (await client.post("/api/admin/invites", json={"role": "sharia_reviewer"}, headers=admin)).json()["codes"][0]
    await register(client, username="reviewer-1", invite_code=code)
    r = await client.post(f"/api/admin/invites/{code}/revoke", headers=admin)
    assert r.status_code == 409 and r.json()["detail"] == "invite_used"


async def test_plt17_r12_new_admin_codes_expire_after_seven_days(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    out = (await client.post("/api/admin/invites", json={"role": "admin"}, headers=admin)).json()
    ends = datetime.fromisoformat(out["expires_at"])
    assert timedelta(days=6, hours=23) < ends - datetime.now(UTC) <= timedelta(days=7)


async def test_plt17_r12_expired_code_is_refused(client):
    from sqlalchemy import update

    from app.core.db import SessionLocal
    from app.platform.models import Invite

    admin = auth(await with_roles(client, "admin-1", "admin"))
    code = (await client.post("/api/admin/invites", json={"role": "admin"}, headers=admin)).json()["codes"][0]
    async with SessionLocal() as s:  # seven days and a minute later
        await s.execute(update(Invite).where(Invite.code == code).values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
        await s.commit()
    refused = await client.post(
        "/api/auth/register",
        json={"display_name": "نخلة", "username": "late-1", "password": "pass-1234-word", "invite_code": code},
    )
    assert refused.status_code == 400


async def test_plt17_r12_list_shows_each_code_status(client):
    from sqlalchemy import update

    from app.core.db import SessionLocal
    from app.platform.models import Invite

    admin = auth(await with_roles(client, "admin-1", "admin"))
    codes = (await client.post("/api/admin/invites", json={"role": "mentor", "count": 4}, headers=admin)).json()["codes"]
    available, used, expired, revoked = codes
    await register(client, username="mentor-1", invite_code=used, gender="m")
    await client.post(f"/api/admin/invites/{revoked}/revoke", headers=admin)
    async with SessionLocal() as s:
        await s.execute(update(Invite).where(Invite.code == expired).values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
        await s.commit()
    status = {i["code"]: i["status"] for i in (await client.get("/api/admin/invites", headers=admin)).json()}
    assert status == {available: "available", used: "used", expired: "expired", revoked: "revoked"}
