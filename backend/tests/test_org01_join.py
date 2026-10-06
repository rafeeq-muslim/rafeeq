"""ORG-01 join through an organisation: one test (at least) per example."""

from urllib.parse import parse_qs, urlparse

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.organizations.models import OrgLink, OrgLinkStatus, OrgSnapshot
from tests.cmp_helpers import person
from tests.conftest import auth, register
from tests.org_helpers import device, link, make_org


async def rows(model) -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(func.count()).select_from(model)) or 0


async def test_org01_r1_one_qr_code_per_language_is_the_same_for_everyone(client):
    org = await make_org(client)
    assert set(org.codes) == {"tl", "ar"} and org.codes["tl"] != org.codes["ar"]
    a = await link(client, org.codes["tl"])
    b = await link(client, org.codes["tl"])
    for install_id in (a, b):
        r = await client.post("/api/org/link/status", json={"install_id": install_id})
        assert r.json()["linked"] and r.json()["lang"] == "tl"
    shared = (await client.get(f"/api/org/{org.id}/codes", headers=org.coordinator.h)).json()
    assert [c["code"] for c in shared if c["lang"] == "tl"] == [org.codes["tl"]]  # the same code for every Filipino convert


async def test_org01_r1_the_link_carries_only_the_organisation_and_the_language(client):
    org = await make_org(client)
    shared = (await client.get(f"/api/org/{org.id}/codes", headers=org.coordinator.h)).json()
    tl = next(c for c in shared if c["lang"] == "tl")
    query = parse_qs(urlparse(tl["path"]).query)
    assert urlparse(tl["path"]).path == "/app/welcome" and query == {"lang": ["tl"], "org": [org.codes["tl"]]}
    events_before = await rows(OutboxEvent)
    r = await client.get(f"/api/org/codes/{org.codes['tl']}")
    assert r.status_code == 200 and r.json() == {"name": org.name, "lang": "tl"}
    # Reading the code keeps nothing at all about whoever opened it.
    assert await rows(OrgLink) == 0 and await rows(OutboxEvent) == events_before


async def test_org01_r2_yes_links_and_starts_in_the_links_language(client):
    org = await make_org(client)
    install_id = device()
    r = await client.post("/api/org/link", json={"code": org.codes["tl"], "install_id": install_id})
    assert r.status_code == 201
    body = r.json()
    assert body["linked"] and body["name"] == org.name and body["lang"] == "tl"
    assert await rows(OrgLink) == 1


async def test_org01_r2_no_keeps_nothing_about_the_office(client):
    org = await make_org(client)
    install_id = device()
    assert (await client.get(f"/api/org/codes/{org.codes['tl']}")).status_code == 200  # the question was shown
    # «لا»: the app calls nothing more.
    r = await client.post("/api/org/link/status", json={"install_id": install_id})
    assert r.json() == {"linked": False, "name": None, "lang": None, "linked_at": None}
    assert await rows(OrgLink) == 0 and await rows(OrgLinkStatus) == 0


async def test_org01_r3_a_code_typed_in_me_links_after_yes(client):
    org = await make_org(client, name="منصة حوار", languages=("en",))
    code = org.codes["en"]
    typed = f" {code[:4].lower()} {code[4:].lower()} "  # typed by hand, with a space
    info = await client.get(f"/api/org/codes/{typed}")
    assert info.status_code == 200 and info.json()["name"] == "منصة حوار"
    r = await client.post("/api/org/link", json={"code": typed, "install_id": device()})
    assert r.status_code == 201 and r.json()["linked"]


async def test_org01_r3_a_mistyped_code_says_check_it_and_names_no_organisation(client):
    org = await make_org(client)
    wrong = org.codes["tl"][:-1] + ("A" if org.codes["tl"][-1] != "A" else "B")
    r = await client.get(f"/api/org/codes/{wrong}")
    assert r.status_code == 404 and r.json()["detail"] == "code_invalid"
    assert org.name not in r.text
    r = await client.post("/api/org/link", json={"code": wrong, "install_id": device()})
    assert r.status_code == 404 and org.name not in r.text
    assert await rows(OrgLink) == 0


async def test_org01_r4_unlinking_leaves_the_numbers_and_keeps_past_figures(client):
    from app.organizations.jobs import snapshot_all

    org = await make_org(client)
    install_id = await link(client, org.codes["tl"])
    async with SessionLocal() as s:
        await snapshot_all(s)
    async with SessionLocal() as s:
        before = (await s.scalars(select(OrgSnapshot))).one().figures
    r = await client.post("/api/org/link/remove", json={"install_id": install_id})
    assert r.status_code == 204
    assert await rows(OrgLink) == 0 and await rows(OrgLinkStatus) == 0  # nothing about him stays
    async with SessionLocal() as s:
        assert (await s.scalars(select(OrgSnapshot))).one().figures == before
    dash = (await client.get(f"/api/org/{org.id}/dashboard", headers=org.coordinator.h)).json()
    assert dash["empty"] is True


async def test_org01_r4_linking_another_organisation_ends_the_first(client):
    riyadh = await make_org(client, suffix="1")
    manila = await make_org(client, name="Manila outreach", languages=("tl",), suffix="2")
    install_id = await link(client, riyadh.codes["tl"])
    await link(client, manila.codes["tl"], install_id)
    async with SessionLocal() as s:
        links = (await s.scalars(select(OrgLink))).all()
    assert len(links) == 1 and str(links[0].org_id) == manila.id


async def test_org01_r5_the_coordinator_cannot_find_or_message_a_linked_learner(client):
    org = await make_org(client)
    install_id = await link(client, org.codes["tl"])
    h = org.coordinator.h
    seen = ""
    for path in (f"/api/org/{org.id}/dashboard", f"/api/org/{org.id}/mentors", f"/api/org/{org.id}/codes", "/api/org/mine"):
        r = await client.get(path, headers=h)
        assert r.status_code == 200, path
        seen += r.text
    assert install_id not in seen
    # No route lists, names or reaches linked learners.
    from app.main import app

    paths = {getattr(route, "path", "") for route in app.routes}
    assert not any(p.startswith("/api/org/{org_id}/") and ("learner" in p or "link" in p or "message" in p) for p in paths)
    # And the inbox is a mentor's, not a coordinator's.
    assert (await client.get("/api/inbox/requests", headers=h)).status_code == 403


async def test_org01_r5_a_linked_learner_asks_for_a_human_and_chooses_a_mentor_like_anyone(client):
    org = await make_org(client)
    await person(client, "mentor-a", roles=("mentor",), gender="m", languages=("tl",))
    learner = await person(client, "joseph", gender="m", languages=("tl",))
    before = (await client.get("/api/mentors/suggestions", headers=learner.h)).json()
    await link(client, org.codes["tl"])
    after = (await client.get("/api/mentors/suggestions", headers=learner.h)).json()
    assert [m["id"] for m in after] == [m["id"] for m in before] and len(after) == 1
    r = await client.post("/api/help/requests", json={"kind": "human", "gender": "m", "lang": "tl", "body": "Kumusta"}, headers=learner.h)
    assert r.status_code == 201, r.text


async def test_org01_engagement_status_follows_a_linked_device_only(client):
    org = await make_org(client)
    linked = await link(client, org.codes["tl"])
    other = device()
    for install_id in (linked, other):
        r = await client.post(
            "/api/events", json={"install_id": install_id, "events": [{"type": "lesson_completed", "lesson_id": "u1-l1"}]}
        )
        assert r.status_code == 202
    async with SessionLocal() as s:
        link_row = (await s.scalars(select(OrgLink))).one()
        history = (await s.scalars(select(OrgLinkStatus.status).order_by(OrgLinkStatus.id))).all()
    assert link_row.install_id == linked and link_row.status == "new"
    assert history == [None, "new"]  # linked before any lesson, then new
    # MOT-07 R4 opt-out: no status any more.
    await client.post("/api/events", json={"install_id": linked, "events": [{"type": "opt_out"}]})
    async with SessionLocal() as s:
        assert (await s.scalars(select(OrgLink))).one().status is None
        assert await s.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.payload["install_id"].astext == linked)) == 0


async def test_org01_membership_is_in_the_account_copy_and_goes_with_the_account(client):
    org = await make_org(client)
    export = (await client.get("/api/me/export", headers=org.coordinator.h)).json()
    assert export["organizations"]["membership"]["organization"] == org.name
    assert export["organizations"]["membership"]["as"] == "coordinator"
    learner = await register(client, username="layla-2")
    assert (await client.get("/api/me/export", headers=auth(learner["access_token"]))).json()["organizations"] == {"membership": None}
    assert (await client.delete("/api/me", headers=org.coordinator.h)).status_code == 204
    from app.organizations.models import OrgMember

    assert await rows(OrgMember) == 0
