"""Security audit 2026-10-07 (scope C: M2 M3 M5 L2 L4 L5 L7 L8 L9 L10 L11 L12;
scope A: H2). One regression test or more per finding. Addresses and hosts
below are documentation values (example.com, 192.0.2.0/24)."""

import asyncio
import logging
import re
import smtplib
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select

from app.core import ratelimit
from app.core.config import Settings, get_settings
from app.core.db import SessionLocal, engine
from app.core.events import OutboxEvent
from app.main import app
from app.platform import mailer
from app.platform.models import Invite, OneTimeCode, RefreshSession, User
from tests.conftest import auth, register, with_roles

GOOD_SECRET = "s" * 48
PASSWORD = "pass-1234-word"


def _client(ip: str) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app, client=(ip, 50000)), base_url="http://test")


@pytest.fixture
def codes(monkeypatch):
    """Every two-step code "sent", in order."""
    sent: list[str] = []

    async def fake_send(to, code, locale):
        sent.append(code)
        return True

    monkeypatch.setattr(mailer, "send_code", fake_send)
    return sent


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(get_settings(), "env", "production")


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


async def _with_two_step(client, codes, username="layla-1") -> dict:
    out = await register(client, username=username)
    h = auth(out["access_token"])
    start = (await client.post("/api/me/2fa/start", json={"email": "l@example.com"}, headers=h)).json()
    r = await client.post("/api/me/2fa/confirm", json={"challenge_id": start["challenge_id"], "code": codes[-1]}, headers=h)
    assert r.status_code == 200, r.text
    return out


async def _login(client, username="layla-1") -> str:
    r = await client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    assert r.status_code == 200 and r.json()["two_factor_required"], r.text
    return r.json()["challenge_id"]


# ---- M2: production refuses a public or short secret ---------------------------


def test_sec_m2_production_refuses_the_default_jwt_secret():
    with pytest.raises(ValidationError) as e:
        Settings(_env_file=None, env="production", jwt_secret="dev-only-change-me")
    assert "JWT_SECRET" in str(e.value) and "secrets.token_urlsafe(48)" in str(e.value)


def test_sec_m2_production_refuses_the_env_example_placeholder_and_short_secrets():
    for secret in ("change-me-generate-a-long-random-value", "x" * 31, ""):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, env="production", jwt_secret=secret)


def test_sec_m2_production_refuses_a_short_bootstrap_admin_password():
    with pytest.raises(ValidationError) as e:
        Settings(
            _env_file=None, env="production", jwt_secret=GOOD_SECRET, bootstrap_admin_username="first", bootstrap_admin_password="p" * 15
        )
    assert "BOOTSTRAP_ADMIN_PASSWORD" in str(e.value)


def test_sec_m2_the_refusal_never_prints_a_value():
    with pytest.raises(ValidationError) as e:
        Settings(
            _env_file=None,
            env="production",
            jwt_secret="short-secret-value",
            smtp_password="smtp-pass-value",
            bootstrap_admin_password="tiny-pass",
        )
    for value in ("short-secret-value", "smtp-pass-value", "tiny-pass"):
        assert value not in str(e.value)


def test_sec_m2_production_starts_with_a_long_secret_and_without_push_keys():
    s = Settings(_env_file=None, env="production", jwt_secret=GOOD_SECRET, vapid_private_key="", bootstrap_admin_password="")
    assert s.is_production
    assert Settings(_env_file=None, env="production", jwt_secret=GOOD_SECRET, bootstrap_admin_password="p" * 16).is_production


def test_sec_m2_development_and_tests_still_start_with_the_defaults():
    assert (
        Settings(_env_file=None, env="development", jwt_secret="dev-only-change-me", bootstrap_admin_password="short").env == "development"
    )
    assert not get_settings().is_production  # the test run itself


# ---- M3: logs carry no personal data -------------------------------------------


def test_sec_m3_failed_statements_are_logged_without_their_values():
    assert engine.sync_engine.hide_parameters is True


async def test_sec_m3_mail_failure_logs_the_error_type_only(monkeypatch, caplog):
    def refuse(to, subject, body):
        raise smtplib.SMTPRecipientsRefused({to: (550, b"no such user")})

    monkeypatch.setattr(get_settings(), "smtp_host", "smtp.example.com")
    monkeypatch.setattr(mailer, "_send", refuse)
    with caplog.at_level(logging.DEBUG):
        assert await mailer.send_code("person@example.com", "123456", "en") is False
    assert "SMTPRecipientsRefused" in caplog.text
    assert "person@example.com" not in caplog.text and "123456" not in caplog.text


async def test_sec_m3_push_failure_logs_the_error_type_only(monkeypatch, caplog):
    from app.platform import push
    from app.platform.models import PushSubscription

    endpoint = "https://push.example.com/send/device-secret-token"

    def fail(sub, payload):
        raise ConnectionError(f"cannot reach {sub.endpoint}")

    monkeypatch.setattr(get_settings(), "vapid_private_key", "test-key")
    monkeypatch.setattr(push, "_send_sync", fail)
    with caplog.at_level(logging.DEBUG):
        assert await push.send(PushSubscription(endpoint=endpoint, p256dh="k", auth="a"), {"title": "t"}) is False
    assert "ConnectionError" in caplog.text
    assert "device-secret-token" not in caplog.text and "push.example.com" not in caplog.text


async def test_sec_m3_background_notification_failure_logs_the_error_type_only(caplog):
    from app.companion import notify

    async def fail(session):
        raise RuntimeError("cannot reach https://push.example.com/send/device-secret-token")

    with caplog.at_level(logging.DEBUG):
        notify.later(fail)
        await notify.drain()
    assert "RuntimeError" in caplog.text and "device-secret-token" not in caplog.text


# ---- M5: invite codes --------------------------------------------------------------

CODE_RE = r"-[A-Za-z0-9_-]{22}"  # secrets.token_urlsafe(16): 128 random bits


async def test_sec_m5_team_invite_codes_are_long_and_still_work(client):
    admin = auth(await with_roles(client, "admin-1", "admin"))
    for role, prefix in (("mentor", "MEN"), ("admin", "ADM"), ("sharia_reviewer", "SHA")):
        code = (await client.post("/api/admin/invites", json={"role": role}, headers=admin)).json()["codes"][0]
        assert re.fullmatch(prefix + CODE_RE, code), code
        assert len(code) <= Invite.__table__.c.code.type.length
    out = await register(client, username="new-mentor", invite_code=code, gender="m")
    assert out["user"]["roles"] == ["sharia_reviewer"]
    assert (await client.post(f"/api/admin/invites/{code}/revoke", headers=admin)).status_code == 409  # the code travels in a URL


async def test_sec_m5_organisation_invite_codes_are_long(client):
    from tests.org_helpers import make_org

    org = await make_org(client)
    async with SessionLocal() as s:
        coordinator_code = await s.scalar(select(Invite.code).where(Invite.role == "org_coordinator"))
    assert re.fullmatch("ORG" + CODE_RE, coordinator_code)
    r = await client.post(f"/api/org/{org.id}/invites", headers=org.coordinator.h)
    assert re.fullmatch("MEN" + CODE_RE, r.json()["code"]), r.text


async def test_sec_m5_cmp08_approval_invite_is_long():
    from app.platform.admin import new_invite

    async with SessionLocal() as s:
        invite = new_invite(s, "mentor", None)
        assert re.fullmatch("MEN" + CODE_RE, invite.code)
        s.expunge(invite)


async def test_sec_m5_wrong_invite_codes_from_many_addresses_close_the_door_for_everyone(client):
    async with SessionLocal() as s:
        s.add(Invite(code="MEN-REAL-CODE", role="mentor"))
        await s.commit()
    body = {"display_name": "x", "password": PASSWORD, "gender": "m"}
    n = 0
    for host in range(1, 11):  # 10 addresses, 5 wrong codes each: under every per-address limit
        async with _client(f"192.0.2.{host}") as c:
            for _ in range(5):
                n += 1
                r = await c.post(
                    "/api/auth/register", json={**body, "username": f"guess-{n}", "invite_code": f"MEN-{uuid.uuid4().hex[:8]}"}
                )
                assert r.status_code == 400 and r.json()["detail"] == "invite_invalid"
    async with _client("192.0.2.200") as c:
        r = await c.post("/api/auth/register", json={**body, "username": "right-code", "invite_code": "MEN-REAL-CODE"})
        assert r.status_code == 400 and r.json()["detail"] == "invite_invalid"  # the same answer as a wrong code
        plain = await c.post("/api/auth/register", json={**body, "username": "no-invite"})
        assert plain.status_code == 201  # sign-up without a code is untouched
    async with SessionLocal() as s:
        assert (await s.get(Invite, "MEN-REAL-CODE")).used_by is None


# ---- A-H2 / L2: bounded input and a bounded limiter -------------------------------


async def test_sec_l2_sign_in_fields_are_bounded(client):
    r = await client.post("/api/auth/login", json={"username": "u" * 41, "password": PASSWORD})
    assert r.status_code == 422
    r = await client.post("/api/auth/login", json={"username": "layla-1", "password": "p" * 129})
    assert r.status_code == 422
    assert (await client.get("/api/auth/username-available", params={"u": "u" * 65})).status_code == 422
    out = await register(client)
    r = await client.post(
        "/api/me/password", json={"current_password": "p" * 129, "new_password": "new-pass-5678"}, headers=auth(out["access_token"])
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/auth/register", json={"display_name": "x", "username": "ok-name-1", "password": PASSWORD, "invite_code": "c" * 65}
    )
    assert r.status_code == 422


def test_sec_l2_limiter_still_limits():
    for _ in range(3):
        ratelimit.hit("k", 3, 60)
    with pytest.raises(HTTPException) as e:
        ratelimit.hit("k", 3, 60)
    assert e.value.status_code == 429


def test_sec_h2_many_distinct_keys_never_pass_the_cap(monkeypatch):
    monkeypatch.setattr(ratelimit, "MAX_KEYS", 100, raising=False)
    for i in range(1000):
        ratelimit.hit(f"login-user:{i}", 8, 600)
    assert len(ratelimit._hits) <= 100


def test_sec_h2_a_key_in_use_survives_the_eviction_of_older_keys(monkeypatch):
    monkeypatch.setattr(ratelimit, "MAX_KEYS", 100, raising=False)
    for i in range(300):
        ratelimit.hit(f"other:{i}", 8, 600)
        if i % 50 == 0:
            try:
                ratelimit.hit("attacker", 2, 600)
            except HTTPException:
                pass
    with pytest.raises(HTTPException):
        ratelimit.hit("attacker", 2, 600)  # still counted: flooding other keys does not reset it


def test_sec_h2_a_huge_key_is_stored_at_a_fixed_length():
    ratelimit.hit("login-user:" + "x" * 2_000_000, 8, 600)
    assert all(len(k) <= 64 for k in ratelimit._hits)


def test_sec_l2_a_key_is_removed_once_its_hits_have_left_the_window(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: clock[0])
    ratelimit.hit("once", 5, 10)
    assert len(ratelimit._hits) == 1
    clock[0] += 11
    assert ratelimit.full("once", 5, 10) is False  # read again: dropped
    assert len(ratelimit._hits) == 0


def test_sec_h2_the_sweep_removes_keys_nobody_reads_again(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: clock[0])
    for i in range(20):
        ratelimit.hit(f"short:{i}", 5, 10)
    ratelimit.hit("long", 5, 3600)
    clock[0] += 120
    ratelimit.hit("fresh", 5, 10)
    assert len(ratelimit._hits) == 2  # "long" (still in its window) and "fresh"


async def test_sec_h2_two_step_sign_in_is_limited_per_address(client):
    statuses = [
        (await client.post("/api/auth/login/2fa", json={"challenge_id": str(uuid.uuid4()), "code": "123456"})).status_code
        for _ in range(31)
    ]
    assert statuses[0] == 400 and statuses[-1] == 429


# ---- L4: one live sign-in code, failures counted per account -------------------


async def test_sec_l4_a_new_sign_in_code_ends_the_earlier_one(client, codes):
    await _with_two_step(client, codes)
    first = await _login(client)
    first_code = codes[-1]
    second = await _login(client)
    old = await client.post("/api/auth/login/2fa", json={"challenge_id": first, "code": first_code})
    assert old.status_code == 400 and old.json()["detail"] == "code_expired"
    new = await client.post("/api/auth/login/2fa", json={"challenge_id": second, "code": codes[-1]})
    assert new.status_code == 200 and new.json()["access_token"]


async def test_sec_l4_wrong_codes_are_counted_per_account_across_challenges(client, codes):
    await _with_two_step(client, codes)
    for _ in range(2):
        challenge = await _login(client)
        for _ in range(5):
            r = await client.post("/api/auth/login/2fa", json={"challenge_id": challenge, "code": _wrong(codes[-1])})
            assert r.status_code == 400
    challenge = await _login(client)
    r = await client.post("/api/auth/login/2fa", json={"challenge_id": challenge, "code": codes[-1]})
    assert r.status_code == 429  # ten wrong codes in ten minutes: even the right one waits


# ---- L5: /2fa/confirm limited, attempts counted atomically -------------------------


async def test_sec_l5_confirm_is_rate_limited(client):
    out = await register(client)
    h = auth(out["access_token"])
    statuses = [
        (await client.post("/api/me/2fa/confirm", json={"challenge_id": str(uuid.uuid4()), "code": "123456"}, headers=h)).status_code
        for _ in range(7)
    ]
    assert statuses[:6] == [400] * 6 and statuses[6] == 429


async def test_sec_l5_parallel_guesses_cannot_share_an_attempt(client, codes):
    await _with_two_step(client, codes)
    challenge = await _login(client)
    wrong = _wrong(codes[-1])
    rs = await asyncio.gather(*[client.post("/api/auth/login/2fa", json={"challenge_id": challenge, "code": wrong}) for _ in range(6)])
    details = sorted(r.json()["detail"] for r in rs)
    assert details == ["code_expired"] + ["code_invalid"] * 5
    async with SessionLocal() as s:
        assert (await s.get(OneTimeCode, uuid.UUID(challenge))).attempts == 5


# ---- L7: access tokens from before a password change ---------------------------


async def test_sec_l7_access_token_from_before_a_password_change_is_refused(client):
    out = await register(client)
    s = get_settings()
    issued = datetime.now(UTC) - timedelta(minutes=5)
    old = jwt.encode(
        {"sub": out["user"]["id"], "roles": ["learner"], "iat": issued, "exp": issued + timedelta(minutes=30), "typ": "access"},
        s.jwt_secret,
        algorithm="HS256",
    )
    assert (await client.get("/api/me", headers=auth(old))).status_code == 200
    r = await client.post("/api/me/password", json={"current_password": PASSWORD, "new_password": "new-pass-5678"}, headers=auth(old))
    assert r.status_code == 204
    assert (await client.get("/api/me", headers=auth(old))).status_code == 401
    # The device that made the change refreshes (lib/api.ts does it on a 401) and goes on.
    fresh = await client.post("/api/auth/refresh")
    assert fresh.status_code == 200
    assert (await client.get("/api/me", headers=auth(fresh.json()["access_token"]))).status_code == 200


async def test_sec_l7_accounts_that_never_changed_their_password_are_untouched(client):
    out = await register(client)
    async with SessionLocal() as s:
        assert (await s.get(User, uuid.UUID(out["user"]["id"]))).password_changed_at is None
    assert (await client.get("/api/me", headers=auth(out["access_token"]))).status_code == 200


# ---- L8: password change is rate limited -----------------------------------------


async def test_sec_l8_password_change_is_rate_limited(client):
    out = await register(client)
    h = auth(out["access_token"])
    statuses = [
        (
            await client.post("/api/me/password", json={"current_password": "wrong-guess-1", "new_password": "new-pass-5678"}, headers=h)
        ).status_code
        for _ in range(6)
    ]
    assert statuses[:5] == [400] * 5 and statuses[5] == 429


# ---- L9: refresh cookie name ---------------------------------------------------------


def _set_cookies(r) -> list[str]:
    return r.headers.get_list("set-cookie")


async def test_sec_l9_production_sets_the_prefixed_cookie(client, production):
    r = await client.post("/api/auth/register", json={"display_name": "x", "username": "layla-1", "password": PASSWORD})
    assert r.status_code == 201
    cookie = next(c for c in _set_cookies(r) if c.startswith("__Secure-rafeeq_refresh="))
    assert "Secure" in cookie and "HttpOnly" in cookie and "Path=/api/auth" in cookie and "Domain" not in cookie
    token = cookie.split("=", 1)[1].split(";", 1)[0]
    client.cookies.clear()
    again = await client.post("/api/auth/refresh", headers={"Cookie": f"__Secure-rafeeq_refresh={token}"})
    assert again.status_code == 200


async def test_sec_l9_a_session_under_the_old_name_keeps_working_and_moves_to_the_new_name(client, monkeypatch):
    await register(client)  # issued before the change: the old cookie name
    old = client.cookies.get("rafeeq_refresh")
    assert old
    client.cookies.clear()
    monkeypatch.setattr(get_settings(), "env", "production")
    r = await client.post("/api/auth/refresh", headers={"Cookie": f"rafeeq_refresh={old}"})
    assert r.status_code == 200  # nobody is signed out
    cookies = _set_cookies(r)
    assert any(c.startswith("__Secure-rafeeq_refresh=") and "Max-Age=0" not in c for c in cookies)
    assert any(c.startswith("rafeeq_refresh=") and "Max-Age=0" in c for c in cookies)  # the old one is removed


async def test_sec_l9_sign_out_clears_both_names(client, production):
    r = await client.post("/api/auth/register", json={"display_name": "x", "username": "layla-1", "password": PASSWORD})
    token = next(c for c in _set_cookies(r) if c.startswith("__Secure-")).split("=", 1)[1].split(";", 1)[0]
    client.cookies.clear()
    out = await client.post("/api/auth/logout", headers={"Cookie": f"__Secure-rafeeq_refresh={token}"})
    cleared = [c.split("=", 1)[0] for c in _set_cookies(out) if "Max-Age=0" in c]
    assert sorted(cleared) == ["__Secure-rafeeq_refresh", "rafeeq_refresh"]
    assert (await client.post("/api/auth/refresh", headers={"Cookie": f"__Secure-rafeeq_refresh={token}"})).status_code == 401


async def test_sec_l9_local_runs_keep_the_plain_name(client):
    await register(client)
    assert client.cookies.get("rafeeq_refresh") and not client.cookies.get("__Secure-rafeeq_refresh")


# ---- L10: daily purge of sessions and codes ----------------------------------------


async def test_sec_l10_purge_removes_expired_sessions_and_spent_codes(client):
    from app.platform import retention

    out = await register(client)
    uid = uuid.UUID(out["user"]["id"])
    now = datetime.now(UTC)
    async with SessionLocal() as s:
        s.add(RefreshSession(user_id=uid, token_hash="a" * 64, expires_at=now - timedelta(minutes=1)))
        s.add(
            OneTimeCode(
                user_id=uid,
                purpose="enable_2fa",
                code_hash="b" * 64,
                pending_email="old@example.com",
                expires_at=now - timedelta(minutes=1),
            )
        )
        s.add(OneTimeCode(user_id=uid, purpose="login", code_hash="c" * 64, expires_at=now + timedelta(minutes=5), used_at=now))
        s.add(OneTimeCode(user_id=uid, purpose="login", code_hash="d" * 64, expires_at=now + timedelta(minutes=5)))
        await s.commit()
    async with SessionLocal() as s:
        counts = await retention.purge(s)
    assert counts == {"refresh_sessions": 1, "one_time_codes": 2}
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(RefreshSession)) == 1  # the live session from sign-up
        left = (await s.scalars(select(OneTimeCode))).all()
        assert [c.code_hash for c in left] == ["d" * 64]  # still usable
    assert (await client.post("/api/auth/refresh")).status_code == 200


def test_sec_l10_the_purge_runs_daily():
    from app import jobs

    jobs._register()
    job = jobs.scheduler.get_job("plt-retention-purge")
    assert job is not None and "hour='0'" in str(job.trigger)


async def test_sec_l10_turning_two_step_off_erases_the_pending_email(client, codes):
    out = await _with_two_step(client, codes)
    h = auth((await client.post("/api/auth/refresh")).json()["access_token"])
    assert (await client.post("/api/me/2fa/start", json={"email": "second@example.com"}, headers=h)).status_code == 200
    assert (await client.delete("/api/me/2fa", headers=h)).status_code == 200
    async with SessionLocal() as s:
        assert (await s.scalars(select(OneTimeCode).where(OneTimeCode.user_id == uuid.UUID(out["user"]["id"])))).all() == []


async def test_sec_l10_a_new_start_replaces_the_earlier_pending_email(client, codes):
    out = await register(client)
    h = auth(out["access_token"])
    for email in ("first@example.com", "second@example.com"):
        assert (await client.post("/api/me/2fa/start", json={"email": email}, headers=h)).status_code == 200
    async with SessionLocal() as s:
        assert (await s.scalars(select(OneTimeCode.pending_email))).all() == ["second@example.com"]


# ---- L11: account deletion and events naming a mentor ----------------------------


async def test_sec_l11_deleting_an_account_removes_events_naming_it_as_mentor(client):
    out = await register(client)
    uid, other = out["user"]["id"], str(uuid.uuid4())
    async with SessionLocal() as s:
        # The rows as publish() writes them (no handlers: only the history matters here).
        s.add(OutboxEvent(name="MentorSuspended", source="ORG", payload={"mentor_id": uid}))
        s.add(OutboxEvent(name="GroupCreated", source="CMP", payload={"group_id": str(uuid.uuid4()), "mentor_id": uid}))
        s.add(OutboxEvent(name="MentorSuspended", source="ORG", payload={"mentor_id": other}))
        await s.commit()
    assert (await client.delete("/api/me", headers=auth(out["access_token"]))).status_code == 204
    async with SessionLocal() as s:
        payloads = (await s.scalars(select(OutboxEvent.payload))).all()
    assert uid not in str(payloads)
    assert {"mentor_id": other} in payloads  # another mentor's history stays


# ---- L12: no API docs in production -------------------------------------------------


async def test_sec_l12_production_serves_no_docs_or_schema():
    from app.main import api_docs

    prod = Settings(_env_file=None, env="production", jwt_secret=GOOD_SECRET)
    assert api_docs(prod) == {"docs_url": None, "redoc_url": None, "openapi_url": None}
    async with AsyncClient(transport=ASGITransport(app=FastAPI(**api_docs(prod))), base_url="http://test") as c:
        for path in ("/api/docs", "/api/redoc", "/api/openapi.json", "/docs", "/redoc", "/openapi.json"):
            assert (await c.get(path)).status_code == 404, path


async def test_sec_l12_local_runs_keep_the_docs(client):
    assert (await client.get("/api/openapi.json")).status_code == 200
    assert (await client.get("/api/docs")).status_code == 200
