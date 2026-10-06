"""Security review B-H1: a mentor's gender is the one staff approved.

The same-gender rule (CMP-01 R3) decides which requests, mentees and groups
a mentor reaches, so it cannot rest on what the applicant changes after
applying or types at sign-up. Contacts here are made up (example.com)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.companion.models import MentorApplication
from app.core import ratelimit
from app.core.db import SessionLocal
from app.platform.models import Invite, User
from tests.cmp_helpers import person
from tests.conftest import auth, register, with_roles
from tests.org_helpers import make_org

APPLY = "/api/mentor-applications"
STAFF = "/api/admin/mentor-applications"


def form(**over) -> dict:
    body = {
        "display_name": "Yusuf",
        "gender": "m",
        "languages": ["en"],
        "locale": "en",
        "about": "I have helped new Muslims at my local centre for two years.",
        "contact": "volunteer@example.com",
        "rules_accepted": True,
    }
    body.update(over)
    return body


async def team(client) -> dict:
    ratelimit.reset()
    return auth(await with_roles(client, "team-h1", "team"))


async def user_of(username: str) -> User:
    async with SessionLocal() as s:
        return await s.scalar(select(User).where(User.username == username))


async def sign_up(client, username: str, code: str, **extra) -> dict:
    ratelimit.reset()
    return await register(client, username=username, invite_code=code, **extra)


# --- CMP-08 R5: an application made from an account ----------------------------


async def test_h1_account_that_changed_gender_after_applying_is_not_approved(client):
    applicant = await person(client, "applicant-1")  # no gender yet
    assert (await client.post(APPLY, json=form(gender="m", contact=None), headers=applicant.h)).status_code == 201
    # A learner still sets their own gender freely: after staff read «m», it becomes «f».
    assert (await client.patch("/api/me", json={"gender": "f"}, headers=applicant.h)).status_code == 200
    h = await team(client)
    (app,) = (await client.get(STAFF, headers=h)).json()
    assert app["gender"] == "m"

    r = await client.post(f"{STAFF}/{app['id']}/approve", headers=h)

    assert r.status_code == 409 and r.json()["detail"] == "gender_mismatch", r.text
    u = await user_of("applicant-1")
    assert "mentor" not in u.roles and u.gender == "f"  # nothing changed
    async with SessionLocal() as s:
        row = await s.get(MentorApplication, app["id"])
        assert row.status == "pending" and row.invite_code is None


async def test_h1_approved_account_gets_the_gender_on_the_application(client):
    applicant = await person(client, "applicant-2")
    await client.post(APPLY, json=form(gender="f", contact=None), headers=applicant.h)
    h = await team(client)
    (app,) = (await client.get(STAFF, headers=h)).json()

    assert (await client.post(f"{STAFF}/{app['id']}/approve", headers=h)).status_code == 200

    u = await user_of("applicant-2")
    assert "mentor" in u.roles and u.gender == "f"
    # ... and it is locked from then on (CMP-01 R3).
    assert (await client.patch("/api/me", json={"gender": "m"}, headers=applicant.h)).status_code == 403


# --- CMP-08 R4: the invite issued on approval -----------------------------------


async def test_h1_invite_from_an_application_carries_the_approved_gender(client):
    ratelimit.reset()
    assert (await client.post(APPLY, json=form(gender="m"))).status_code == 201
    h = await team(client)
    (app,) = (await client.get(STAFF, headers=h)).json()
    code = (await client.post(f"{STAFF}/{app['id']}/approve", headers=h)).json()["invite_code"]
    async with SessionLocal() as s:
        assert (await s.get(Invite, code)).gender == "m"

    # The registrant says «f»: the vetted «m» is what the account gets.
    out = await sign_up(client, "vetted-brother", code, gender="f", languages=["en"])

    assert out["user"]["roles"] == ["mentor"] and out["user"]["gender"] == "m"
    assert (await user_of("vetted-brother")).gender == "m"


async def test_h1_registrant_needs_no_gender_when_the_invite_has_one(client):
    ratelimit.reset()
    await client.post(APPLY, json=form(gender="f"))
    h = await team(client)
    (app,) = (await client.get(STAFF, headers=h)).json()
    code = (await client.post(f"{STAFF}/{app['id']}/approve", headers=h)).json()["invite_code"]

    out = await sign_up(client, "vetted-sister", code)

    assert out["user"]["gender"] == "f"


# --- admin invites ---------------------------------------------------------------


async def test_h1_admin_mentor_invite_needs_a_gender_and_enforces_it(client):
    admin = auth(await with_roles(client, "admin-h1", "admin"))

    r = await client.post("/api/admin/invites", json={"role": "mentor"}, headers=admin)
    assert r.status_code == 400 and r.json()["detail"] == "gender_required_for_mentor", r.text

    r = await client.post("/api/admin/invites", json={"role": "mentor", "gender": "f"}, headers=admin)
    assert r.status_code == 200, r.text
    code = r.json()["codes"][0]
    listed = {i["code"]: i for i in (await client.get("/api/admin/invites", headers=admin)).json()}
    assert listed[code]["gender"] == "f"

    out = await sign_up(client, "admin-invited", code, gender="m")
    assert out["user"]["gender"] == "f"


async def test_h1_other_roles_need_no_gender_and_keep_none_on_the_code(client):
    admin = auth(await with_roles(client, "admin-h1b", "admin"))
    r = await client.post("/api/admin/invites", json={"role": "sharia_reviewer", "gender": "m"}, headers=admin)
    assert r.status_code == 200, r.text
    async with SessionLocal() as s:
        assert (await s.get(Invite, r.json()["codes"][0])).gender is None


# --- ORG-02 R1: an organisation's mentor invite ---------------------------------


async def test_h1_org_mentor_invite_needs_a_gender_and_enforces_it(client):
    org = await make_org(client)
    url = f"/api/org/{org.id}/invites"

    assert (await client.post(url, headers=org.coordinator.h)).status_code == 422
    assert (await client.post(url, json={"gender": "x"}, headers=org.coordinator.h)).status_code == 422

    r = await client.post(url, json={"gender": "m"}, headers=org.coordinator.h)
    assert r.status_code == 201 and r.json()["gender"] == "m", r.text
    out = await sign_up(client, "org-invited", r.json()["code"], gender="f")
    assert out["user"]["roles"] == ["mentor"] and out["user"]["gender"] == "m"
    assert [i["gender"] for i in (await client.get(url, headers=org.coordinator.h)).json()] == ["m"]


# --- codes made before invites carried a gender ---------------------------------


async def test_h1_old_invite_without_gender_keeps_the_registrant_answer(client):
    async with SessionLocal() as s:
        s.add(Invite(code="MEN-OLD00001", role="mentor", expires_at=datetime.now(UTC) + timedelta(days=1)))
        s.add(Invite(code="MEN-OLD00002", role="mentor"))
        await s.commit()

    out = await sign_up(client, "old-code-1", "MEN-OLD00001", gender="f")
    assert out["user"]["gender"] == "f"

    ratelimit.reset()
    r = await client.post(
        "/api/auth/register",
        json={"display_name": "Old Code", "username": "old-code-2", "password": "pass-1234-word", "invite_code": "MEN-OLD00002"},
    )
    assert r.status_code == 400 and r.json()["detail"] == "gender_required_for_mentor"
