"""CMP-08 R3 (security audit 2026-10-07, M4): the mentor applicant's contact
is encrypted at rest. Contacts and keys here are made up (example.com, 555
numbers, keys generated in the test)."""

import logging

import pytest
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from cryptography.fernet import Fernet
from sqlalchemy import text

from app.companion import jobs
from app.companion.applications import encrypt_plaintext, rotate
from app.companion.models import MentorApplication
from app.core import crypto, ratelimit
from app.core.config import get_settings
from app.core.db import SessionLocal
from tests.cmp_helpers import person
from tests.conftest import auth, with_roles
from tests.test_cmp08_mentor_application import ADMIN, EMAIL, URL, apply, form, listed, rows, team

HMAC_A = "test-hmac-key-a-test-hmac-key-a-0"
HMAC_B = "test-hmac-key-b-test-hmac-key-b-0"


@pytest.fixture
def keys(monkeypatch):
    """Set the environment and the two key settings for one test."""

    def use(env: str = "development", fernet: str = "", mac: str = "") -> None:
        s = get_settings()
        monkeypatch.setattr(s, "env", env)
        monkeypatch.setattr(s, "application_contact_keys", fernet)
        monkeypatch.setattr(s, "application_contact_hmac_key", mac)
        crypto.reset()

    yield use
    monkeypatch.undo()
    crypto.reset()


async def raw() -> list[tuple]:
    """The three stored columns, straight from the table."""
    q = "SELECT contact, contact_enc, contact_hmac FROM cmp_mentor_applications ORDER BY created_at"
    async with SessionLocal() as s:
        return [tuple(r) for r in await s.execute(text(q))]


async def plaintext_row(contact: str | None = EMAIL, **over) -> None:
    """A row as the previous release stored it: the contact in plain text."""
    async with SessionLocal() as s:
        values = {"display_name": "قديم", "gender": "f", "languages": ["ar"], "about": "نص", "status": "pending", **over}
        s.add(MentorApplication(contact=contact, **values))
        await s.commit()


# --- the helper ------------------------------------------------------------------


def test_cmp08_r3_encrypt_and_decrypt_round_trip():
    token = crypto.encrypt(EMAIL)
    assert EMAIL not in token and crypto.decrypt(token) == EMAIL
    assert crypto.encrypt(EMAIL) != token  # a fresh IV every time: equal contacts do not look equal
    assert crypto.decrypt(None) is None and crypto.decrypt("not-a-token") is None


def test_cmp08_r3_the_digest_is_keyed_and_stable(keys):
    keys(fernet=Fernet.generate_key().decode(), mac=HMAC_A)
    a = crypto.contact_digest(EMAIL)
    assert a == crypto.contact_digest(EMAIL) and len(a) == 64 and a != crypto.contact_digest("other@example.com")
    keys(fernet=Fernet.generate_key().decode(), mac=HMAC_B)
    assert crypto.contact_digest(EMAIL) != a


def test_cmp08_r3_another_key_reads_nothing(keys):
    keys(fernet=Fernet.generate_key().decode(), mac=HMAC_A)
    token = crypto.encrypt(EMAIL)
    keys(fernet=Fernet.generate_key().decode(), mac=HMAC_A)
    assert crypto.decrypt(token) is None


def test_cmp08_r3_outside_production_a_named_development_key_is_used_with_one_warning(keys, caplog):
    keys()
    with caplog.at_level(logging.WARNING, logger="app.core.crypto"):
        assert crypto.available() and crypto.available()
        assert crypto.decrypt(crypto.encrypt(EMAIL)) == EMAIL
    assert len(caplog.records) == 1 and "development key" in caplog.text
    assert "dev-only-not-a-secret" in crypto.DEV_ONLY_NOT_SECRET_HMAC_KEY


@pytest.mark.parametrize(
    ("fernet", "mac"),
    [
        ("", ""),
        ("", HMAC_A),
        (Fernet.generate_key().decode(), ""),
        (Fernet.generate_key().decode(), "short"),
        ("not-a-fernet-key", HMAC_A),
        (crypto.DEV_ONLY_NOT_SECRET_KEY, crypto.DEV_ONLY_NOT_SECRET_HMAC_KEY),  # the public key is refused in production
    ],
)
def test_cmp08_r3_production_without_usable_keys_is_unavailable_and_never_raises(keys, caplog, fernet, mac):
    keys("production", fernet, mac)
    with caplog.at_level(logging.WARNING, logger="app.core.crypto"):
        assert crypto.available() is False and crypto.available() is False
        assert crypto.decrypt("anything") is None
        with pytest.raises(crypto.CryptoUnavailable):
            crypto.encrypt(EMAIL)
    # One warning that names both settings and says how to make the values.
    assert len(caplog.records) == 1
    assert "APPLICATION_CONTACT_KEYS" in caplog.text and "APPLICATION_CONTACT_HMAC_KEY" in caplog.text
    assert "urandom(32)" in caplog.text and "token_urlsafe(32)" in caplog.text


# --- storage ---------------------------------------------------------------------


async def test_cmp08_r3_the_contact_is_stored_encrypted_never_in_plain_text(client):
    assert (await apply(client)).status_code == 201
    ((plain, enc, digest),) = await raw()
    assert plain is None and enc and EMAIL not in enc and "example.com" not in enc
    assert digest == crypto.contact_digest(EMAIL) and crypto.decrypt(enc) == EMAIL
    assert [a["contact"] for a in await listed(client, await team(client))] == [EMAIL]  # staff read it decrypted
    ratelimit.reset()
    admin = auth(await with_roles(client, "admin-9", "admin"))
    assert [a["contact"] for a in await listed(client, admin)] == [EMAIL]


async def test_cmp08_r3_the_same_contact_replaces_the_earlier_pending_application(client):
    await apply(client, about="الأول")
    await apply(client, contact="Volunteer@Example.com", about="الثاني")  # normalised to the same contact
    await apply(client, contact="other@example.com", about="شخص آخر")
    assert sorted(r.about for r in await rows()) == sorted(["الثاني", "شخص آخر"])
    assert all(plain is None for plain, _, _ in await raw())


async def test_cmp08_r3_a_signed_in_application_stores_no_contact_at_all(client):
    p = await person(client, "maryam-1", gender="f")
    await apply(client, p.h, contact=None)
    assert await raw() == [(None, None, None)]


async def test_cmp08_r3_rejection_clears_the_ciphertext_the_digest_and_any_plain_text(client):
    h = await team(client)
    await apply(client)
    await plaintext_row("old@example.com")
    for a in await listed(client, h):
        r = await client.post(f"{ADMIN}/{a['id']}/reject", json={}, headers=h)
        assert r.status_code == 200 and r.json()["contact"] is None
    assert await raw() == [(None, None, None), (None, None, None)]


async def test_cmp08_r3_the_export_has_the_applicants_own_contact_decrypted(client):
    p = await person(client, "maryam-1", gender="f")
    await apply(client, p.h)
    assert (await client.get("/api/me/export", headers=p.h)).json()["companion"]["mentor_application"]["contact"] == EMAIL


async def test_cmp08_r3_a_wrong_key_shows_an_empty_contact_not_an_error(client, keys):
    h = await team(client)
    p = await person(client, "maryam-1", gender="f")
    keys(fernet=Fernet.generate_key().decode(), mac=HMAC_A)
    await apply(client, p.h)
    keys(fernet=Fernet.generate_key().decode(), mac=HMAC_A)  # the key was lost or replaced without rotation
    r = await client.get(ADMIN, headers=h)
    assert r.status_code == 200 and [a["contact"] for a in r.json()] == [None]
    export = await client.get("/api/me/export", headers=p.h)
    assert export.status_code == 200 and export.json()["companion"]["mentor_application"]["contact"] is None
    app_id = r.json()[0]["id"]
    assert (await client.post(f"{ADMIN}/{app_id}/approve", headers=h)).status_code == 200  # deciding still works


# --- rows from before the encryption ------------------------------------------------


async def test_cmp08_r3_existing_plain_text_rows_are_encrypted_and_the_old_column_emptied(client):
    await plaintext_row()
    await plaintext_row("+15555550100", status="approved")
    await plaintext_row(None, status="rejected", about=None)  # nothing to encrypt
    seen = sorted(str(a["contact"]) for a in await listed(client, await team(client)))
    assert seen == ["+15555550100", "None", EMAIL]  # readable meanwhile
    async with SessionLocal() as s:
        assert await encrypt_plaintext(s) == 2
        assert await encrypt_plaintext(s) == 0  # safe to run again
    stored = await raw()
    assert all(plain is None for plain, _, _ in stored)
    assert sorted(crypto.decrypt(enc) for _, enc, _ in stored if enc) == ["+15555550100", EMAIL]
    assert {d for _, _, d in stored} == {crypto.contact_digest(EMAIL), crypto.contact_digest("+15555550100"), None}
    seen = sorted(str(a["contact"]) for a in await listed(client, await team(client, "team-2")))
    assert seen == ["+15555550100", "None", EMAIL]


async def test_cmp08_r3_a_new_application_replaces_a_pending_row_still_in_plain_text(client):
    await plaintext_row()
    await apply(client, about="نص جديد")
    (row,) = await rows()
    assert row.about == "نص جديد" and row.contact is None and row.readable_contact() == EMAIL


def test_cmp08_r3_the_encryption_step_runs_at_start_and_daily():
    scheduler = AsyncIOScheduler(timezone="UTC")
    jobs.register(scheduler)
    assert scheduler.get_job("cmp-applications-encrypt") is not None  # once, shortly after start
    assert scheduler.get_job("cmp-applications-purge").func is jobs._run  # daily, after the purge


# --- production without the keys: closed, not down ------------------------------------


async def test_cmp08_r3_production_without_keys_closes_the_form_and_everything_else_works(client, keys, caplog):
    h = await team(client)
    p = await person(client, "maryam-1", gender="f")
    await apply(client, contact="kept@example.com")  # encrypted while the keys were there
    await plaintext_row("old@example.com")
    keys("production")
    # The app starts: registering the jobs logs the one warning and raises nothing.
    with caplog.at_level(logging.WARNING, logger="app.core.crypto"):
        jobs.register(AsyncIOScheduler(timezone="UTC"))
    assert len(caplog.records) == 1 and "APPLICATION_CONTACT_KEYS" in caplog.text and "APPLICATION_CONTACT_HMAC_KEY" in caplog.text
    assert (await client.get("/api/health")).status_code == 200
    # The form answers 503, with or without an account, and keeps nothing.
    for headers, contact in ((None, EMAIL), (p.h, None)):
        r = await apply(client, headers, contact=contact)
        assert (r.status_code, r.json()["detail"]) == (503, "applications_closed")
    assert len(await raw()) == 2
    # Staff lists still load: an encrypted contact shows empty, a plain one is still readable.
    r = await client.get(ADMIN, headers=h)
    assert r.status_code == 200 and [a["contact"] for a in r.json()] == [None, "old@example.com"]
    assert (await client.get(f"{URL}/mine", headers=p.h)).status_code == 200
    # Nothing is encrypted or emptied without keys.
    async with SessionLocal() as s:
        assert await encrypt_plaintext(s) == 0
    assert [plain for plain, _, _ in await raw()] == [None, "old@example.com"]


async def test_cmp08_r3_when_the_keys_are_added_later_the_plain_rows_get_encrypted(client, keys):
    h = await team(client)
    keys("production")
    await plaintext_row()
    await jobs._encrypt()
    assert [plain for plain, _, _ in await raw()] == [EMAIL]  # still waiting, still readable
    assert [a["contact"] for a in await listed(client, h)] == [EMAIL]
    keys("production", Fernet.generate_key().decode(), HMAC_A)
    await jobs._encrypt()  # the step that runs at start and daily
    ((plain, enc, digest),) = await raw()
    assert plain is None and crypto.decrypt(enc) == EMAIL and digest == crypto.contact_digest(EMAIL)
    assert [a["contact"] for a in await listed(client, h)] == [EMAIL]
    ratelimit.reset()
    assert (await client.post(URL, json=form(contact="new@example.com"))).status_code == 201  # the form is open again


# --- rotation ---------------------------------------------------------------------------


async def test_cmp08_r3_rotation_re_encrypts_with_the_newest_key_and_the_new_digest_key(client, keys):
    old, new = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    keys(fernet=old, mac=HMAC_A)
    await apply(client)
    await apply(client, contact="b@example.com")
    keys(fernet=f"{new},{old}", mac=HMAC_B)  # newest first; the old key still reads
    async with SessionLocal() as s:
        assert await rotate(s) == (2, 0)
    keys(fernet=new, mac=HMAC_B)  # the old key is removed
    stored = await raw()
    assert sorted(crypto.decrypt(enc) for _, enc, _ in stored) == ["b@example.com", EMAIL]
    assert {d for _, _, d in stored} == {crypto.contact_digest(EMAIL), crypto.contact_digest("b@example.com")}
    await apply(client, about="بعد التدوير")  # the lookup works with the new digest
    assert len(await rows()) == 2


async def test_cmp08_r3_rotation_leaves_a_row_it_cannot_read(client, keys):
    keys(fernet=Fernet.generate_key().decode(), mac=HMAC_A)
    await apply(client)
    before = await raw()
    keys(fernet=Fernet.generate_key().decode(), mac=HMAC_A)
    async with SessionLocal() as s:
        assert await rotate(s) == (0, 1)
    assert await raw() == before
