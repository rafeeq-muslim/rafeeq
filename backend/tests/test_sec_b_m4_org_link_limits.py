"""Security review B-M4 (minimal part): forged devices can still link to an
organisation's code (the install ID is the device's own word), so the number
of new links one code takes in a day is capped, and the admin sees how many
devices each code holds. Server-issued install IDs and the rest are a product
decision reported to the owner."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.core import limits, ratelimit
from app.core.db import SessionLocal
from app.organizations.models import OrgLink
from tests.conftest import auth, with_roles
from tests.org_helpers import device, link, make_org


async def try_link(client, code: str, install_id: str | None = None):
    ratelimit.reset()  # the per-address limit is not what is tested here
    return await client.post("/api/org/link", json={"code": code, "install_id": install_id or device()})


async def test_m4_one_code_takes_a_limited_number_of_new_links_a_day(client, monkeypatch):
    limits.override("org_links_per_code_day", 3)  # admin-editable (plt-admin-limits)
    org = await make_org(client, languages=("tl", "ar"))
    for _ in range(3):
        assert (await try_link(client, org.codes["tl"])).status_code == 201

    r = await try_link(client, org.codes["tl"])

    assert r.status_code == 429 and r.json()["detail"] == "rate_limited", r.text
    async with SessionLocal() as s:
        assert len(list(await s.scalars(select(OrgLink.id)))) == 3
    # The organisation's other code, and another organisation, are not affected.
    assert (await try_link(client, org.codes["ar"])).status_code == 201
    other = await make_org(client, name="Other office", languages=("tl",), suffix="2")
    assert (await try_link(client, other.codes["tl"])).status_code == 201


async def test_m4_the_limit_is_per_day_and_a_device_linking_again_does_not_count_twice(client, monkeypatch):
    limits.override("org_links_per_code_day", 2)
    org = await make_org(client, languages=("tl",))
    mine = await link(client, org.codes["tl"])
    assert (await try_link(client, org.codes["tl"], mine)).status_code == 201  # the same device again: still one link
    assert (await try_link(client, org.codes["tl"])).status_code == 201
    assert (await try_link(client, org.codes["tl"])).status_code == 429

    async with SessionLocal() as s:  # a day later the code takes new links again
        await s.execute(update(OrgLink).values(linked_at=datetime.now(UTC) - timedelta(hours=25)))
        await s.commit()
    assert (await try_link(client, org.codes["tl"])).status_code == 201


async def test_m4_the_default_limit_leaves_room_for_an_office_day(client):
    assert limits.get("org_links_per_code_day") == 200


async def test_m4_the_admin_sees_how_many_devices_each_code_holds(client):
    org = await make_org(client, languages=("tl", "ar"))
    for _ in range(3):
        await link(client, org.codes["tl"])
    old = await link(client, org.codes["ar"])
    async with SessionLocal() as s:
        await s.execute(update(OrgLink).where(OrgLink.install_id == old).values(linked_at=datetime.now(UTC) - timedelta(days=3)))
        await s.commit()
    admin = auth(await with_roles(client, "admin-m4", "admin"))

    (row,) = [o for o in (await client.get("/api/admin/orgs", headers=admin)).json() if o["id"] == org.id]

    counts = {c["lang"]: (c["links"], c["links_last_day"]) for c in row["codes"]}
    assert counts == {"tl": (3, 3), "ar": (1, 0)}


async def test_m4_the_coordinator_gets_no_per_code_counts(client):
    """ORG-03 R2: a number under 10 is never shown to the organisation."""
    org = await make_org(client, languages=("tl",))
    await link(client, org.codes["tl"])
    rows = (await client.get(f"/api/org/{org.id}/codes", headers=org.coordinator.h)).json()
    assert rows and all(set(r) == {"code", "lang", "path"} for r in rows)
