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
