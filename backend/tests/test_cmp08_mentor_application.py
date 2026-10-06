"""CMP-08 «التقديم كمرشد»: one test (at least) per example. Contacts here
are made up (example.com, 555 numbers)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.companion.applications import KEEP_DAYS, purge
from app.companion.models import MentorApplication, MentorProfile
from app.core import ratelimit
from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.organizations.models import OrgMember
from app.platform.models import Invite, User
from tests.cmp_helpers import Person, person, record_pushes, settle
from tests.conftest import auth, register, with_roles
from tests.org_helpers import make_org

URL = "/api/mentor-applications"
ADMIN = "/api/admin/mentor-applications"
EMAIL = "volunteer@example.com"


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


def form(**over) -> dict:
    body = {
        "display_name": "أم يوسف",
        "gender": "f",
        "languages": ["ar", "tl"],
        "locale": "ar",
        "place": "الرياض",
        "about": "أتابع المسلمات الجديدات في مكتب الحي منذ ثلاث سنوات.",
        "contact": EMAIL,
        "rules_accepted": True,
    }
    body.update(over)
    return body


async def apply(client, headers=None, **over):
    ratelimit.reset()
    return await client.post(URL, json=form(**over), headers=headers or {})


async def rows() -> list[MentorApplication]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(MentorApplication).order_by(MentorApplication.created_at)))


async def team(client, name="team-1") -> dict:
    ratelimit.reset()
    return auth(await with_roles(client, name, "team"))


async def listed(client, h) -> list[dict]:
    r = await client.get(ADMIN, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


# --- R1: the form ------------------------------------------------------------


async def test_cmp08_r1_a_visitor_applies_without_an_account(client):
    r = await apply(client)
    assert r.status_code == 201, r.text
    assert r.json() == {"received": True, "keep_days": 90}
    (row,) = await rows()
    assert (row.status, row.display_name, row.gender, row.languages, row.place) == ("pending", "أم يوسف", "f", ["ar", "tl"], "الرياض")
    assert row.readable_contact() == EMAIL and row.user_id is None and row.org_id is None


async def test_cmp08_r1_a_phone_number_is_a_contact_too(client):
    assert (await apply(client, contact="+1 (555) 555-0100")).status_code == 201
    assert (await rows())[0].readable_contact() == "+15555550100"


@pytest.mark.parametrize(
    "over",
    [
        {"rules_accepted": False},  # the mentor rules are not accepted
        {"contact": None},  # no way to answer a visitor
        {"contact": "call me"},  # neither an email nor a phone number
        {"languages": []},
        {"gender": None},
        {"about": "x" * 601},  # capped
        {"about": "   "},
    ],
)
async def test_cmp08_r1_an_incomplete_application_is_refused(client, over):
    r = await apply(client, **over)
    assert r.status_code == 422, r.text
    assert await rows() == []


async def test_cmp08_r1_a_signed_in_applicant_needs_no_contact(client):
    p = await person(client, "maryam-1", gender="f")
    r = await apply(client, p.h, contact=None)
    assert r.status_code == 201, r.text
    (row,) = await rows()
    assert row.user_id == p.id and row.readable_contact() is None


# --- R2: one answer, and no third party against abuse ---------------------------


async def test_cmp08_r2_the_answer_never_says_whether_the_contact_applied_before(client):
    first = await apply(client)
    second = await apply(client, about="نص جديد بعد التعديل.")
    assert (first.status_code, first.json()) == (second.status_code, second.json()) == (201, {"received": True, "keep_days": 90})
    (row,) = await rows()  # the second replaced the first
    assert row.about == "نص جديد بعد التعديل."


async def test_cmp08_r2_a_filled_hidden_field_gets_the_same_answer_and_keeps_nothing(client):
    r = await apply(client, website="https://spam.example.com")
    assert (r.status_code, r.json()) == (201, {"received": True, "keep_days": 90})
    assert await rows() == []


async def test_cmp08_r2_too_many_applications_from_one_address_are_limited(client):
    ratelimit.reset()
    for i in range(5):
        assert (await client.post(URL, json=form(contact=f"v{i}@example.com"))).status_code == 201
    r = await client.post(URL, json=form(contact="v9@example.com"))
    assert (r.status_code, r.json()["detail"]) == (429, "rate_limited")
    assert len(await rows()) == 5


async def test_cmp08_r2_no_address_is_stored(client):
    await apply(client)
    assert "ip" not in {c.name for c in MentorApplication.__table__.columns}
    assert not any("address" in c.name for c in MentorApplication.__table__.columns)


# --- R3: the contact is for staff only -------------------------------------------


async def test_cmp08_r3_only_team_and_admin_read_applications(client):
    await apply(client)
    assert (await client.get(ADMIN)).status_code == 401
    learner = await person(client, "learner-1")
    mentor = await person(client, "mentor-1", roles=("mentor",), gender="f")
    reviewer = await person(client, "reviewer-1", roles=("sharia_reviewer",))
    for p in (learner, mentor, reviewer):
        assert (await client.get(ADMIN, headers=p.h)).status_code == 403
        assert (await client.post(f"{ADMIN}/{uuid.uuid4()}/approve", headers=p.h)).status_code == 403
    ratelimit.reset()
    admin = auth(await with_roles(client, "admin-9", "admin"))
    for h in (await team(client), admin):
        assert [a["contact"] for a in await listed(client, h)] == [EMAIL]


async def test_cmp08_r3_the_applicant_reads_back_the_state_only(client):
    p = await person(client, "maryam-1", gender="f")
    assert (await client.get(f"{URL}/mine", headers=p.h)).json() is None
    await apply(client, p.h)
    mine = (await client.get(f"{URL}/mine", headers=p.h)).json()
    assert set(mine) == {"status", "applied_at"} and mine["status"] == "pending"


# --- R4: the team decides ----------------------------------------------------------


async def test_cmp08_r4_pending_applications_come_first(client):
    h = await team(client)
    await apply(client, contact="a@example.com", display_name="أولى")
    await apply(client, contact="b@example.com", display_name="ثانية")
    await apply(client, contact="c@example.com", display_name="ثالثة")
    first = (await listed(client, h))[0]
    assert (await client.post(f"{ADMIN}/{first['id']}/reject", json={}, headers=h)).status_code == 200
    out = await listed(client, h)
    assert [(a["display_name"], a["status"]) for a in out] == [("ثانية", "pending"), ("ثالثة", "pending"), ("أولى", "rejected")]


async def test_cmp08_r4_approval_issues_a_one_time_invite_to_send_by_hand(client, pushes):
    h = await team(client)
    await apply(client)
    await settle()
    pushes.clear()
    app_id = (await listed(client, h))[0]["id"]
    r = await client.post(f"{ADMIN}/{app_id}/approve", headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["status"] == "approved" and out["invite_code"].startswith("MEN-") and out["invite_used"] is False
    assert out["invite_expires_at"] is None and out["contact"] == EMAIL  # still there to send the code
    await settle()
    assert pushes == []  # Rafeeq sends nothing to the applicant
    ratelimit.reset()
    data = await register(client, username="um-yusuf", invite_code=out["invite_code"], gender="f", languages=["ar", "tl"])
    assert data["user"]["roles"] == ["mentor"]
    assert (await client.get("/api/inbox/requests", headers=auth(data["access_token"]))).status_code == 403  # ORG-02 R2 gate
    assert (await listed(client, h))[0]["invite_used"] is True
    ratelimit.reset()
    again = await client.post(
        "/api/auth/register",
        json={"display_name": "x", "username": "other-1", "password": "pass-1234-word", "invite_code": out["invite_code"], "gender": "f"},
    )
    assert (again.status_code, again.json()["detail"]) == (400, "invite_invalid")


async def test_cmp08_r4_an_application_naming_an_organisation_gets_that_organisations_invite(client):
    org = await make_org(client)
    h = await team(client)
    assert (await apply(client, org_code=org.codes["tl"])).status_code == 201
    a = (await listed(client, h))[0]
    assert a["organization"] == org.name
    out = (await client.post(f"{ADMIN}/{a['id']}/approve", headers=h)).json()
    expires = datetime.fromisoformat(out["invite_expires_at"])
    assert timedelta(days=6, hours=23) < expires - datetime.now(UTC) <= timedelta(days=7)
    async with SessionLocal() as s:
        assert str((await s.get(Invite, out["invite_code"])).org_id) == org.id
    ratelimit.reset()
    data = await register(client, username="maria-1", invite_code=out["invite_code"], gender="f", languages=["tl"])
    async with SessionLocal() as s:
        m = await s.get(OrgMember, uuid.UUID(data["user"]["id"]))
        assert (str(m.org_id), m.kind) == (org.id, "mentor")


async def test_cmp08_r4_a_wrong_organisation_code_is_refused_and_names_nobody(client):
    r = await apply(client, org_code="ZZZZ9999")
    assert (r.status_code, r.json()["detail"]) == (404, "code_invalid")
    assert await rows() == []


async def test_cmp08_r4_rejection_deletes_the_contact_and_the_text_at_once(client):
    h = await team(client)
    p = await person(client, "maryam-1", gender="f")
    await apply(client, p.h)
    app_id = (await listed(client, h))[0]["id"]
    r = await client.post(f"{ADMIN}/{app_id}/reject", json={"note": "لم نتمكن من التحقق"}, headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["status"], out["contact"], out["about"], out["note"], out["invite_code"]) == (
        "rejected",
        None,
        None,
        "لم نتمكن من التحقق",
        None,
    )
    (row,) = await rows()
    assert (row.contact, row.contact_enc, row.contact_hmac, row.about) == (None, None, None, None)
    mine = (await client.get(f"{URL}/mine", headers=p.h)).json()
    assert mine["status"] == "rejected" and "note" not in mine  # the note is the team's own


async def test_cmp08_r4_a_decided_application_is_not_decided_again(client):
    h = await team(client)
    await apply(client)
    app_id = (await listed(client, h))[0]["id"]
    assert (await client.post(f"{ADMIN}/{app_id}/approve", headers=h)).status_code == 200
    for action in ("approve", "reject"):
        r = await client.post(f"{ADMIN}/{app_id}/{action}", json={}, headers=h)
        assert (r.status_code, r.json()["detail"]) == (409, "already_decided")
    async with SessionLocal() as s:
        assert len(list(await s.scalars(select(Invite)))) == 1


async def test_cmp08_r4_the_team_deletes_an_application(client):
    h = await team(client)
    await apply(client)
    app_id = (await listed(client, h))[0]["id"]
    assert (await client.delete(f"{ADMIN}/{app_id}", headers=h)).status_code == 204
    assert await rows() == []
    assert (await client.delete(f"{ADMIN}/{app_id}", headers=h)).status_code == 404


# --- R5: an application made from an account ----------------------------------------


async def test_cmp08_r5_approving_a_signed_in_applicant_makes_the_account_a_mentor(client, pushes):
    h = await team(client)
    p = await person(client, "maryam-1", languages=("en",))
    await apply(client, p.h, contact=None, gender="f", languages=["tl"])
    a = (await listed(client, h))[0]
    assert a["has_account"] is True
    out = (await client.post(f"{ADMIN}/{a['id']}/approve", headers=h)).json()
    assert out["status"] == "approved" and out["invite_code"] is None
    me = (await client.get("/api/me", headers=p.h)).json()
    assert me["roles"] == ["learner", "mentor"] and me["gender"] == "f" and me["languages"] == ["en", "tl"]
    async with SessionLocal() as s:
        events = list(await s.scalars(select(OutboxEvent).where(OutboxEvent.name == "MentorApproved")))
        assert [e.payload["mentor_id"] for e in events] == [str(p.id)]
        prof = await s.get(MentorProfile, p.id)
        assert prof is not None and prof.suspended is False and prof.rules_accepted_at is None
    # As any mentor: the rules first (ORG-02 R2), and the gender is locked (CMP-01 R3).
    assert (await client.get("/api/inbox/requests", headers=p.h)).json()["detail"] == "mentor_rules_required"
    locked = await client.patch("/api/me", json={"gender": "m"}, headers=p.h)
    assert (locked.status_code, locked.json()["detail"]) == (403, "gender_locked")
    await settle()
    to_applicant = [pl for uid, pl in pushes if uid == str(p.id)]
    assert to_applicant == [{"title": "You have a new notice", "body": "", "url": "/mentor-apply", "tag": "cmp-notice"}]


async def test_cmp08_r5_an_accounts_own_gender_wins_over_the_form(client):
    p = await person(client, "yusuf-1", gender="m")
    await apply(client, p.h, gender="f")
    assert (await rows())[0].gender == "m"


async def test_cmp08_r5_a_mentor_does_not_apply_again(client):
    m = await person(client, "mentor-1", roles=("mentor",), gender="f")
    r = await apply(client, m.h)
    assert (r.status_code, r.json()["detail"]) == (409, "already_mentor")


async def test_cmp08_r5_with_an_organisation_the_account_becomes_its_mentor(client):
    org = await make_org(client)
    p = await person(client, "maria-1")
    await apply(client, p.h, contact=None, org_code=org.codes["tl"])
    a = (await listed(client, await team(client)))[0]
    assert (await client.post(f"/api/org/{org.id}/mentor-applications/{a['id']}/approve", headers=org.coordinator.h)).status_code == 200
    names = [m["display_name"] for m in (await client.get(f"/api/org/{org.id}/mentors", headers=org.coordinator.h)).json()["mentors"]]
    assert names == [p.display_name]


# --- R6: retention ----------------------------------------------------------------------


async def test_cmp08_r6_old_applications_are_purged(client):
    h = await team(client)
    for name in ("old-pending", "new-pending", "old-approved", "new-rejected", "old-rejected"):
        await apply(client, contact=f"{name}@example.com", display_name=name)
    ids = {a["display_name"]: a["id"] for a in await listed(client, h)}
    assert (await client.post(f"{ADMIN}/{ids['old-approved']}/approve", headers=h)).status_code == 200
    for name in ("new-rejected", "old-rejected"):
        assert (await client.post(f"{ADMIN}/{ids[name]}/reject", json={}, headers=h)).status_code == 200
    now = datetime.now(UTC)
    old, recent = now - timedelta(days=KEEP_DAYS, hours=1), now - timedelta(days=KEEP_DAYS - 1)
    async with SessionLocal() as s:
        t = MentorApplication
        await s.execute(update(t).where(t.display_name == "old-pending").values(created_at=old))
        await s.execute(update(t).where(t.display_name == "new-pending").values(created_at=recent))
        # Applied long ago, decided recently: the 90 days run from the decision.
        await s.execute(update(t).where(t.display_name == "new-rejected").values(created_at=old, decided_at=recent))
        await s.execute(update(t).where(t.display_name.in_(["old-approved", "old-rejected"])).values(decided_at=old))
        await s.commit()
        assert await purge(s, now) == 3
    assert sorted(r.display_name for r in await rows()) == ["new-pending", "new-rejected"]
    async with SessionLocal() as s:
        assert len(list(await s.scalars(select(Invite)))) == 1  # the invite itself is not touched


def test_cmp08_r6_the_purge_runs_every_day():
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    from app.companion import jobs

    scheduler = AsyncIOScheduler(timezone="UTC")
    jobs.register(scheduler)
    job = scheduler.get_job("cmp-applications-purge")
    assert job is not None and str(job.trigger).count("hour='0'") == 1


# --- R7: the applicant's rights --------------------------------------------------------------


async def test_cmp08_r7_deleting_the_account_removes_its_application(client):
    p = await person(client, "maryam-1", gender="f")
    await apply(client, p.h)
    await apply(client, contact="someone-else@example.com")
    assert (await client.delete("/api/me", headers=p.h)).status_code == 204
    assert [r.readable_contact() for r in await rows()] == ["someone-else@example.com"]


async def test_cmp08_r7_the_data_export_has_the_application_without_the_teams_note(client):
    h = await team(client)
    p = await person(client, "maryam-1", gender="f")
    assert (await client.get("/api/me/export", headers=p.h)).json()["companion"]["mentor_application"] is None
    await apply(client, p.h)
    got = (await client.get("/api/me/export", headers=p.h)).json()["companion"]["mentor_application"]
    assert got["contact"] == EMAIL and got["status"] == "pending" and got["about"]
    app_id = (await listed(client, h))[0]["id"]
    await client.post(f"{ADMIN}/{app_id}/reject", json={"note": "ملاحظة للفريق فقط"}, headers=h)
    text = (await client.get("/api/me/export", headers=p.h)).text
    assert (
        "ملاحظة للفريق فقط" not in text
        and "note" not in (await client.get("/api/me/export", headers=p.h)).json()["companion"]["mentor_application"]
    )


async def test_cmp08_r7_the_applicant_withdraws_the_application(client):
    p = await person(client, "maryam-1", gender="f")
    await apply(client, p.h)
    assert (await client.delete(f"{URL}/mine", headers=p.h)).status_code == 204
    assert await rows() == []


async def test_cmp08_r7_deleting_the_account_leaves_no_event_naming_it(client):
    h = await team(client)
    p = await person(client, "maryam-1", gender="f")
    await apply(client, p.h)
    app_id = (await listed(client, h))[0]["id"]
    await client.post(f"{ADMIN}/{app_id}/approve", headers=h)
    assert (await client.delete("/api/me", headers=p.h)).status_code == 204
    async with SessionLocal() as s:
        left = list(await s.scalars(select(OutboxEvent).where(OutboxEvent.name == "MentorApproved")))
        assert left == []
        assert await s.get(User, p.id) is None


# --- R8: the organisation's coordinator --------------------------------------------------------


async def test_cmp08_r8_a_coordinator_sees_only_applications_that_named_the_organisation(client):
    org = await make_org(client)
    other = await make_org(client, name="جمعية أخرى", languages=("en",), suffix="2")
    h = await team(client)
    await apply(client, contact="a@example.com", display_name="للمكتب", org_code=org.codes["ar"])
    await apply(client, contact="b@example.com", display_name="بلا جهة")
    await apply(client, contact="c@example.com", display_name="للجمعية", org_code=other.codes["en"])
    url = f"/api/org/{org.id}/mentor-applications"
    mine = (await client.get(url, headers=org.coordinator.h)).json()
    assert [a["display_name"] for a in mine] == ["للمكتب"]
    assert mine[0]["contact"] == "a@example.com"  # ORG-02 R1: the organisation approves its mentors and sends the code
    assert (await client.get(url, headers=other.coordinator.h)).status_code == 403
    learner = await person(client, "learner-1")
    assert (await client.get(url, headers=learner.h)).status_code == 403
    theirs = [a for a in await listed(client, h) if a["display_name"] == "للجمعية"][0]
    r = await client.post(f"{url}/{theirs['id']}/approve", headers=org.coordinator.h)
    assert r.status_code == 404  # another organisation's application


async def test_cmp08_r8_a_coordinator_decides_and_never_sees_the_teams_note(client):
    org = await make_org(client)
    h = await team(client)
    await apply(client, contact="a@example.com", display_name="أولى", org_code=org.codes["ar"])
    await apply(client, contact="b@example.com", display_name="ثانية", org_code=org.codes["ar"])
    url = f"/api/org/{org.id}/mentor-applications"
    ids = {a["display_name"]: a["id"] for a in await listed(client, h)}
    await client.post(f"{ADMIN}/{ids['أولى']}/reject", json={"note": "للفريق"}, headers=h)
    out = (await client.post(f"{url}/{ids['ثانية']}/approve", headers=org.coordinator.h)).json()
    assert out["invite_code"].startswith("MEN-") and out["invite_expires_at"]
    seen = (await client.get(url, headers=org.coordinator.h)).json()
    assert {a["display_name"]: a["note"] for a in seen} == {"أولى": None, "ثانية": None}
    r = await client.post(f"{url}/{ids['أولى']}/reject", headers=org.coordinator.h)
    assert r.status_code == 409


# --- R9: the team hears about a new application, neutrally -------------------------------------


async def test_cmp08_r9_the_team_gets_a_neutral_notice(client, pushes):
    t = Person(await register(client, username="team-ar", locale="ar"))
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.id == t.id).values(roles=["team"]))
        await s.commit()
    learner = await person(client, "learner-1")
    await apply(client)
    await settle()
    assert pushes == [(str(t.id), {"title": "لديك تنبيه جديد", "body": "", "url": "/mentor-applications", "tag": "cmp-notice"})]
    assert str(learner.id) not in [uid for uid, _ in pushes]
    pushes.clear()
    await apply(client)  # the same contact again: no second notice
    await settle()
    assert pushes == []
