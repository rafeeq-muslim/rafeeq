"""MOT-08 (open question decided 2026-10-06): the team role is granted only in
the database; the admin API never grants it, but other roles and revoking work."""

from tests.conftest import auth, register, with_roles


async def test_mot08_admin_cannot_create_a_team_invite(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    r = await client.post("/api/admin/invites", json={"role": "team"}, headers=admin)
    assert r.status_code == 403
    assert r.json()["detail"] == "team_role_db_only"


async def test_mot08_admin_cannot_grant_team_through_roles(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    user = await register(client, username="layla-1")
    r = await client.put(f"/api/admin/users/{user['user']['id']}/roles", json={"roles": ["learner", "team"]}, headers=admin)
    assert r.status_code == 403
    assert r.json()["detail"] == "team_role_db_only"


async def test_mot08_granting_another_role_still_works(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    user = await register(client, username="layla-1")
    r = await client.put(f"/api/admin/users/{user['user']['id']}/roles", json={"roles": ["learner", "mentor"]}, headers=admin)
    assert r.status_code == 200 and r.json()["roles"] == ["learner", "mentor"]
    r = await client.post("/api/admin/invites", json={"role": "mentor"}, headers=admin)
    assert r.status_code == 200 and r.json()["codes"]


async def test_mot08_a_team_member_keeps_or_loses_the_role(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    await with_roles(client, "team-1", "team")
    team_id = next(u["id"] for u in (await client.get("/api/admin/users?username=team-1", headers=admin)).json())
    kept = await client.put(f"/api/admin/users/{team_id}/roles", json={"roles": ["team", "mentor"]}, headers=admin)
    assert kept.status_code == 200
    revoked = await client.put(f"/api/admin/users/{team_id}/roles", json={"roles": ["learner"]}, headers=admin)
    assert revoked.status_code == 200 and revoked.json()["roles"] == ["learner"]


async def _old_team_invite(code: str = "TEA-OLD00001") -> str:
    """An unused team invite minted before the MOT-08 decision (written directly, as it was)."""
    from app.core.db import SessionLocal
    from app.platform.models import Invite

    async with SessionLocal() as s:
        s.add(Invite(code=code, role="team"))
        await s.commit()
    return code


async def test_mot08_old_team_invite_opens_a_normal_account_with_a_notice(client):
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.platform.models import Invite

    code = await _old_team_invite()
    out = await register(client, username="layla-1", invite_code=code)
    assert out["user"]["roles"] == ["learner"]
    assert out["notice"] == "team_role_db_only"
    async with SessionLocal() as s:
        inv = await s.scalar(select(Invite).where(Invite.code == code))
        assert inv.used_by is not None and str(inv.used_by) == out["user"]["id"]


async def test_mot08_ordinary_signup_has_no_notice(client):
    out = await register(client, username="layla-1")
    assert out.get("notice") is None


async def test_mot08_org_invites_mint_only_mentor_and_coordinator(client):
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.platform.models import Invite
    from tests.org_helpers import make_org

    org = await make_org(client)
    r = await client.post(f"/api/org/{org.id}/invites", headers=org.coordinator.h)
    assert r.status_code == 201
    async with SessionLocal() as s:
        roles = {i.role for i in await s.scalars(select(Invite))}
    assert roles == {"mentor", "org_coordinator"}


async def test_mot08_org_invite_helper_refuses_team():
    import uuid

    import pytest
    from fastapi import HTTPException

    from app.core.db import SessionLocal
    from app.organizations.manage import _invite

    async with SessionLocal() as s:
        with pytest.raises(HTTPException) as e:
            await _invite(s, uuid.uuid4(), "team", uuid.uuid4())
    assert e.value.status_code == 403 and e.value.detail == "team_role_db_only"
