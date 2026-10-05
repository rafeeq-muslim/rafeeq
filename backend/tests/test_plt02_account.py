"""PLT-02 optional account: one test per example."""

from sqlalchemy import select

from app.core.db import SessionLocal
from app.platform.models import Invite
from tests.conftest import auth, register


async def test_plt02_r1_guest_needs_no_account(client):
    # Learning and asking work without an account: the health route and the
    # public endpoints answer with no token.
    assert (await client.get("/api/health")).json() == {"ok": True}


async def test_plt02_r2_only_three_fields(client):
    r = await client.post("/api/auth/register", json={"display_name": "x", "username": "abc-12", "password": "12345678", "phone": "0500"})
    assert r.status_code == 201
    me = r.json()["user"]
    assert "phone" not in me and me["email_hint"] is None


async def test_plt02_r3_every_field_can_be_generated(client):
    r = (await client.get("/api/auth/suggest?locale=ar")).json()
    assert r["display_name"] and r["username"] and len(r["password"]) >= 16
    await register(client, username=r["username"], password=r["password"])
    ok = await client.post("/api/auth/login", json={"username": r["username"], "password": r["password"]})
    assert ok.json()["access_token"]


async def test_plt02_r3_taken_username_gets_alternatives(client):
    await register(client, username="layla-1")
    r = await client.post("/api/auth/register", json={"display_name": "a", "username": "layla-1", "password": "pass-1234-word"})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "username_taken" and len(r.json()["detail"]["suggestions"]) == 3


async def test_plt02_r5_only_display_name_is_public(client):
    out = await register(client)
    me = (await client.get("/api/me", headers=auth(out["access_token"]))).json()
    assert me["display_name"] == "نخلة الهادئ"


async def test_plt02_r6_wrong_2fa_code_is_rejected(client, monkeypatch):
    sent = {}

    async def fake_send(to, code, locale):
        sent["code"] = code
        return True

    from app.platform import mailer

    monkeypatch.setattr(mailer, "send_code", fake_send)
    out = await register(client)
    h = auth(out["access_token"])
    start = (await client.post("/api/me/2fa/start", json={"email": "l@example.com"}, headers=h)).json()
    ok = await client.post("/api/me/2fa/confirm", json={"challenge_id": start["challenge_id"], "code": sent["code"]}, headers=h)
    assert ok.json()["two_factor_enabled"] is True
    login = (await client.post("/api/auth/login", json={"username": "layla-1", "password": "pass-1234-word"})).json()
    assert login["two_factor_required"] and login["access_token"] is None
    bad = await client.post(
        "/api/auth/login/2fa", json={"challenge_id": login["challenge_id"], "code": "000000" if sent["code"] != "000000" else "111111"}
    )
    assert bad.status_code == 400 and bad.json()["detail"] == "code_invalid"
    good = await client.post("/api/auth/login/2fa", json={"challenge_id": login["challenge_id"], "code": sent["code"]})
    assert good.json()["access_token"]


async def test_plt02_2fa_reports_missing_email_provider(client):
    out = await register(client)
    r = await client.post("/api/me/2fa/start", json={"email": "l@example.com"}, headers=auth(out["access_token"]))
    assert r.status_code == 503 and r.json()["detail"] == "email_unavailable"


async def test_plt02_delete_account_removes_it(client):
    out = await register(client)
    assert (await client.delete("/api/me", headers=auth(out["access_token"]))).status_code == 204
    r = await client.post("/api/auth/login", json={"username": "layla-1", "password": "pass-1234-word"})
    assert r.status_code == 401


async def test_mentor_signup_needs_team_invite(client):
    async with SessionLocal() as s:
        s.add(Invite(code="MEN-TEST", role="mentor"))
        await s.commit()
    r = await client.post(
        "/api/auth/register",
        json={
            "display_name": "أبو عبدالله",
            "username": "abu-abdullah",
            "password": "pass-1234-word",
            "invite_code": "MEN-TEST",
            "gender": "m",
        },
    )
    assert r.json()["user"]["roles"] == ["mentor"]
    again = await client.post(
        "/api/auth/register",
        json={"display_name": "x", "username": "other-1", "password": "pass-1234-word", "invite_code": "MEN-TEST", "gender": "m"},
    )
    assert again.json()["detail"] == "invite_invalid"
    async with SessionLocal() as s:
        assert (await s.scalar(select(Invite).where(Invite.code == "MEN-TEST"))).used_by is not None


async def test_refresh_rotates_and_logout_ends_session(client):
    await register(client)
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 200 and r.json()["access_token"]
    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/refresh")).status_code == 401
