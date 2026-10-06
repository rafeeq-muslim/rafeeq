"""Helpers for the CMP and MOT-06 tests: people with roles, gender and
languages, and a recorder for push notifications."""

import uuid

from sqlalchemy import update

from app.companion import notify
from app.core import ratelimit
from app.core.db import SessionLocal
from app.platform import push
from app.platform.models import User
from tests.conftest import auth, register


class Person:
    def __init__(self, data: dict):
        self.token: str = data["access_token"]
        self.id = uuid.UUID(data["user"]["id"])
        self.display_name: str = data["user"]["display_name"]
        self.username: str = data["user"]["username"]

    @property
    def h(self) -> dict:
        return auth(self.token)


async def person(client, username: str, *, roles=("learner",), gender=None, languages=("en",), display_name=None, locale="en") -> Person:
    ratelimit.reset()  # the sign-up limit is per IP; tests create many people
    data = await register(client, username=username, display_name=display_name or username.title(), locale=locale)
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.username == username).values(roles=list(roles), gender=gender, languages=list(languages)))
        await s.commit()
    if "mentor" in roles:
        await accept_mentor_rules(data["user"]["id"])
    data["user"]["display_name"] = display_name or username.title()
    return Person(data)


async def accept_mentor_rules(user_id) -> None:
    """ORG-02 R2: a mentor's inbox opens once the mentor rules are accepted."""
    from datetime import UTC, datetime

    from app.companion.models import MentorProfile

    async with SessionLocal() as s:
        uid = uuid.UUID(str(user_id))
        prof = await s.get(MentorProfile, uid)
        if prof is None:
            s.add(MentorProfile(user_id=uid, capacity=8, about="", availability="", accepting=True, rules_accepted_at=datetime.now(UTC)))
        else:
            prof.rules_accepted_at = datetime.now(UTC)
        await s.commit()


def record_pushes(monkeypatch) -> list[tuple[str, dict]]:
    """Records every push payload instead of sending it (use from a fixture)."""
    sent: list[tuple[str, dict]] = []

    async def to_user(session, user_id, payload):
        sent.append((str(user_id), payload))
        return 1

    async def send(sub, payload):
        sent.append((sub.endpoint, payload))
        return True

    monkeypatch.setattr(push, "send_to_user", to_user)
    monkeypatch.setattr(push, "send", send)
    return sent


async def settle():
    await notify.drain()


async def group_with(client, mentor: Person, *members: Person, lang="en", capacity=10) -> dict:
    """A group led by `mentor`, joined by `members` (same gender and language)."""
    r = await client.post("/api/groups", json={"name": "Riyadh Brothers", "lang": lang, "capacity": capacity}, headers=mentor.h)
    assert r.status_code == 201, r.text
    g = r.json()
    for m in members:
        j = await client.post("/api/groups/join", json={"code": g["join_code"]}, headers=m.h)
        assert j.status_code == 200, j.text
    return g


async def say(client, who: Person, group_id: str, body: str) -> str:
    r = await client.post(f"/api/groups/{group_id}/messages", json={"body": body}, headers=who.h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def bodies(client, who: Person, group_id: str) -> list[str]:
    r = await client.get(f"/api/groups/{group_id}/messages", headers=who.h)
    assert r.status_code == 200, r.text
    return [m["body"] for m in r.json()]
