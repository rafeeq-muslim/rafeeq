"""Helpers for the ORG tests: an organisation made by the team, its
coordinator (signed up with the team's one-time code), and linked devices."""

import uuid

from app.core import ratelimit
from tests.cmp_helpers import Person
from tests.conftest import register, with_roles


class Org:
    def __init__(self, data: dict, coordinator: Person):
        self.id: str = data["id"]
        self.name: str = data["name"]
        self.codes: dict[str, str] = {c["lang"]: c["code"] for c in data["codes"]}
        self.coordinator = coordinator


async def make_org(client, name="مكتب الدعوة بالروضة", languages=("tl", "ar"), suffix="1") -> Org:
    ratelimit.reset()
    admin = await with_roles(client, f"admin-{suffix}", "admin")
    h = {"Authorization": f"Bearer {admin}"}
    r = await client.post("/api/admin/orgs", json={"name": name, "languages": list(languages)}, headers=h)
    assert r.status_code == 201, r.text
    org = r.json()
    inv = await client.post(f"/api/admin/orgs/{org['id']}/invites", headers=h)
    assert inv.status_code == 201, inv.text
    coord = await register(client, username=f"coord-{suffix}", invite_code=inv.json()["code"])
    assert coord["user"]["roles"] == ["org_coordinator"]
    return Org(org, Person(coord))


def device() -> str:
    return uuid.uuid4().hex


async def link(client, code: str, install_id: str | None = None) -> str:
    ratelimit.reset()
    install_id = install_id or device()
    r = await client.post("/api/org/link", json={"code": code, "install_id": install_id})
    assert r.status_code == 201, r.text
    return install_id
