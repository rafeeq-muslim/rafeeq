"""Security review B-M3: an urgent request reaches every responder only
until someone answers it (rules.md §2.8); after the first reply it belongs
to that responder and the team. Closing is for the assignee or the team.
Escalating a conversation already held by a responder (a private mentor
thread above all) shows it to the team, not to every mentor."""

import pytest

from tests.cmp_helpers import person, record_pushes, settle

URGENT_PUSH = "An urgent request is waiting"


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def ask(client, who=None, **body) -> tuple[str, dict]:
    json = {"lang": "en", "body": "I need someone", **body}
    if who is None and json.get("kind") != "urgent":
        json.setdefault("gender", "m")
    r = await client.post("/api/help/requests", json=json, headers=who.h if who else {})
    assert r.status_code == 201, r.text
    out = r.json()
    return out["request"]["id"], ({"X-Help-Token": out["guest_token"]} if out.get("guest_token") else (who.h if who else {}))


async def ids(client, who) -> list[str]:
    r = await client.get("/api/inbox/requests", headers=who.h)
    assert r.status_code == 200, r.text
    return [x["id"] for x in r.json()]


async def reply(client, who, rid: str, body="I am here with you"):
    return await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": body}, headers=who.h)


async def cast(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    omar = await person(client, "omar-1", roles=("mentor",), gender="m", languages=("en",))
    maryam = await person(client, "maryam-1", roles=("mentor",), gender="f", languages=("tl",))
    team = await person(client, "team-one", roles=("team",), languages=("ar",))
    return abu, omar, maryam, team


async def choose(client, learner, mentor) -> str:
    """The learner chooses the mentor and writes in their private thread; returns its id."""
    r = await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en"]}, headers=learner.h)
    assert r.status_code == 200, r.text
    r = await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=learner.h)
    assert r.status_code == 200, r.text
    tid = (await client.post("/api/mentors/mine/thread", headers=learner.h)).json()["id"]
    r = await client.post(f"/api/help/requests/{tid}/messages", json={"body": "This stays between me and my mentor"}, headers=learner.h)
    assert r.status_code == 201, r.text
    return tid


# --- unclaimed: everyone (rules.md §2.8) ---------------------------------------


async def test_m3_unclaimed_urgent_request_reaches_every_responder(client):
    abu, omar, maryam, team = await cast(client)
    rid, _ = await ask(client, kind="urgent", lang="tl", body=None)
    for who in (abu, omar, maryam, team):
        assert await ids(client, who) == [rid]
        assert (await client.get(f"/api/inbox/requests/{rid}", headers=who.h)).status_code == 200


# --- after the first reply: the assignee and the team ---------------------------


async def test_m3_answered_urgent_thread_is_for_its_assignee_and_the_team(client):
    abu, omar, maryam, team = await cast(client)
    rid, owner = await ask(client, kind="urgent", body=None)
    assert (await reply(client, abu, rid)).status_code == 201
    r = await client.post(f"/api/help/requests/{rid}/messages", json={"body": "He took my passport and locked the door"}, headers=owner)
    assert r.status_code == 201, r.text

    for other in (omar, maryam):
        assert rid not in await ids(client, other)
        assert (await client.get(f"/api/inbox/requests/{rid}", headers=other.h)).status_code == 404
        assert (await reply(client, other, rid, "Second responder")).status_code == 404
        assert (await client.post(f"/api/inbox/requests/{rid}/close", headers=other.h)).status_code == 404
    for who in (abu, team):
        assert rid in await ids(client, who)
        thread = (await client.get(f"/api/inbox/requests/{rid}", headers=who.h)).json()
        assert [m["body"] for m in thread["messages"]] == ["I am here with you", "He took my passport and locked the door"]
    # The team may step in without taking the conversation from its assignee.
    assert (await reply(client, team, rid, "The team is here too")).status_code == 201
    assert rid in await ids(client, abu)


async def test_m3_new_words_in_an_answered_urgent_thread_alert_its_assignee_and_the_team_only(client, pushes):
    abu, omar, maryam, team = await cast(client)
    rid, owner = await ask(client, kind="urgent", body=None)
    await reply(client, abu, rid)
    await settle()
    pushes.clear()

    await client.post(f"/api/help/requests/{rid}/messages", json={"body": "Are you still there?"}, headers=owner)
    await settle()

    told = {uid for uid, _ in pushes}
    assert told == {str(abu.id), str(team.id)}, pushes


async def test_m3_urgent_thread_returns_to_everyone_when_its_assignee_is_blocked(client):
    abu, omar, maryam, team = await cast(client)
    rid, owner = await ask(client, kind="urgent", body=None)
    await reply(client, abu, rid)
    assert (await client.post(f"/api/help/requests/{rid}/block", headers=owner)).status_code == 204
    assert rid not in await ids(client, abu)
    for who in (omar, maryam, team):
        assert rid in await ids(client, who)  # danger still reaches a human


# --- close: the assignee or the team --------------------------------------------


async def test_m3_only_the_assignee_or_the_team_closes_a_request(client):
    abu, omar, maryam, team = await cast(client)
    pool, _ = await ask(client)  # both brothers see it; nobody answered yet
    assert pool in await ids(client, omar)
    r = await client.post(f"/api/inbox/requests/{pool}/close", headers=omar.h)
    assert r.status_code == 403 and r.json()["detail"] == "not_assigned", r.text
    assert pool in await ids(client, abu)  # still open for the others

    assert (await reply(client, abu, pool)).status_code == 201
    r = await client.post(f"/api/inbox/requests/{pool}/close", headers=abu.h)
    assert r.status_code == 200 and r.json()["status"] == "closed"


async def test_m3_a_mentor_cannot_close_an_unanswered_urgent_request_but_the_team_can(client):
    abu, omar, maryam, team = await cast(client)
    rid, _ = await ask(client, kind="urgent", body=None)
    row = next(x for x in (await client.get("/api/inbox/requests", headers=abu.h)).json() if x["id"] == rid)
    assert row["can_close"] is False
    assert (await client.post(f"/api/inbox/requests/{rid}/close", headers=abu.h)).status_code == 403
    assert rid in await ids(client, maryam)
    row = next(x for x in (await client.get("/api/inbox/requests", headers=team.h)).json() if x["id"] == rid)
    assert row["can_close"] is True
    assert (await client.post(f"/api/inbox/requests/{rid}/close", headers=team.h)).status_code == 200


# --- make urgent ---------------------------------------------------------------


async def test_m3_escalating_a_private_mentor_thread_shows_it_to_the_team_only(client, pushes):
    abu, omar, maryam, team = await cast(client)
    joseph = await person(client, "joseph", languages=("en",))
    tid = await choose(client, joseph, abu)
    await settle()
    pushes.clear()

    r = await client.post(f"/api/inbox/requests/{tid}/urgent", headers=abu.h)
    assert r.status_code == 200 and r.json()["kind"] == "urgent", r.text
    await settle()

    for other in (omar, maryam):
        assert tid not in await ids(client, other)
        assert (await client.get(f"/api/inbox/requests/{tid}", headers=other.h)).status_code == 404
    assert (await ids(client, team))[0] == tid  # a human besides the mentor has it, first in the inbox
    assert tid in await ids(client, abu)
    told = {uid for uid, p in pushes if p["title"] == URGENT_PUSH}
    assert told == {str(team.id)}, pushes


async def test_m3_escalating_a_request_he_answered_shows_it_to_the_team_only(client, pushes):
    abu, omar, maryam, team = await cast(client)
    rid, _ = await ask(client, body="my sponsor hits me")
    await reply(client, abu, rid)
    await settle()
    pushes.clear()

    assert (await client.post(f"/api/inbox/requests/{rid}/urgent", headers=abu.h)).status_code == 200
    await settle()

    assert rid not in await ids(client, omar) and rid not in await ids(client, maryam)
    assert rid in await ids(client, team) and rid in await ids(client, abu)
    assert {uid for uid, p in pushes if p["title"] == URGENT_PUSH} == {str(team.id)}


async def test_m3_escalating_an_unanswered_request_still_reaches_everyone(client, pushes):
    abu, omar, maryam, team = await cast(client)
    joseph = await person(client, "joseph", languages=("en",))
    await choose(client, joseph, abu)
    # CMP-02 R3: a mentee's ordinary request goes to his own mentor first, unanswered.
    rid, _ = await ask(client, joseph, body="my sponsor hits me")
    await settle()
    pushes.clear()

    assert (await client.post(f"/api/inbox/requests/{rid}/urgent", headers=abu.h)).status_code == 200
    await settle()

    for who in (abu, omar, maryam, team):
        assert rid in await ids(client, who)
    told = {uid for uid, p in pushes if p["title"] == URGENT_PUSH}
    assert {str(omar.id), str(maryam.id), str(team.id)} <= told
