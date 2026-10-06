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


async def test_plt02_r1_guest_is_invited_not_forced_for_a_mentor_or_group(client):
    # Choosing a mentor or joining a group needs an account (the app then
    # offers to create one); asking for a human does not.
    assert (await client.post("/api/mentors/choose", json={"mentor_id": "00000000-0000-0000-0000-000000000000"})).status_code == 401
    assert (await client.post("/api/groups/join", json={"code": "ABCDEF"})).status_code == 401
    r = await client.post("/api/help/requests", json={"lang": "en", "body": "Can someone talk to me?", "gender": "f"})
    assert r.status_code == 201


async def test_plt02_r1_three_guest_lessons_move_into_the_account_and_reach_another_device(client):
    out = await register(client)
    phone = {"completed": {f"u1-l{i}": {"first": "2026-10-01T08:00:00Z", "last": "2026-10-01T08:00:00Z", "times": 1} for i in (1, 2, 3)}}
    assert (await client.put("/api/me/learning", json=phone, headers=auth(out["access_token"]))).status_code == 200
    other_device = (await client.post("/api/auth/login", json={"username": "layla-1", "password": "pass-1234-word"})).json()
    got = (await client.get("/api/me/learning", headers=auth(other_device["access_token"]))).json()
    assert set(got["completed"]) == {"u1-l1", "u1-l2", "u1-l3"}


async def test_plt02_r2_gender_is_not_taken_at_sign_up_but_when_matching(client):
    out = await register(client)
    assert out["user"]["gender"] is None
    h = auth(out["access_token"])
    r = await client.put("/api/mentors/me/match", json={"gender": "f", "languages": ["en"]}, headers=h)
    assert r.status_code == 200
    assert (await client.get("/api/me", headers=h)).json()["gender"] == "f"


async def test_plt02_r6_email_service_not_ready_is_reported(client):
    out = await register(client)
    r = await client.get("/api/me/2fa/available", headers=auth(out["access_token"]))
    assert r.json() == {"available": False}


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


async def test_password_change_signs_out_other_devices(client):
    from tests.conftest import register as reg

    out = await reg(client, username="layla-9")
    other = await client.post("/api/auth/login", json={"username": "layla-9", "password": "pass-1234-word"})
    other_cookie = other.cookies.get("rafeeq_refresh")
    r = await client.post(
        "/api/me/password",
        json={"current_password": "pass-1234-word", "new_password": "new-pass-5678"},
        headers=auth(out["access_token"]),
    )
    assert r.status_code == 204
    fresh = r.cookies.get("rafeeq_refresh")
    assert fresh and fresh != other_cookie
    client.cookies.clear()
    client.cookies.set("rafeeq_refresh", other_cookie, path="/api/auth")
    assert (await client.post("/api/auth/refresh")).status_code == 401  # the other device is signed out
    client.cookies.clear()
    client.cookies.set("rafeeq_refresh", fresh, path="/api/auth")
    assert (await client.post("/api/auth/refresh")).status_code == 200  # this device stays signed in


async def test_username_check_is_rate_limited(client):
    codes = [(await client.get("/api/auth/username-available?u=abcd-1")).status_code for _ in range(31)]
    assert codes[-1] == 429
