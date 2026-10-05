"""CMP-03 choose a mentor: one test per example."""

import pytest

from tests.cmp_helpers import person, record_pushes, settle


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def match(client, who, gender="m", languages=("en",)):
    r = await client.put("/api/mentors/me/match", json={"gender": gender, "languages": list(languages)}, headers=who.h)
    assert r.status_code == 200, r.text


async def choose(client, who, mentor):
    r = await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=who.h)
    assert r.status_code == 200, r.text
    return r.json()


async def mentee_ids(client, mentor) -> list[str]:
    return [m["id"] for m in (await client.get("/api/inbox/mentees", headers=mentor.h)).json()]


# R1 -----------------------------------------------------------------------


async def test_cmp03_r1_guest_cannot_choose_a_mentor(client):
    assert (await client.get("/api/mentors/suggestions")).status_code == 401
    assert (await client.post("/api/mentors/choose", json={"mentor_id": "00000000-0000-0000-0000-000000000000"})).status_code == 401
    # «أريد إنسانًا» stays open to the guest
    assert (await client.post("/api/help/requests", json={"lang": "en", "body": "Can someone talk to me?"})).status_code == 201


# R2 -----------------------------------------------------------------------


async def test_cmp03_r2_suggests_three_same_gender_least_loaded_first(client):
    mentors = [await person(client, f"brother-{i}", roles=("mentor",), gender="m", languages=("en",)) for i in range(4)]
    await person(client, "sister-1", roles=("mentor",), gender="f", languages=("en",))
    # brothers 0, 1, 2 already have mentees; brother-3 has none
    for i, m in enumerate(mentors[:3]):
        for j in range(i + 1):
            learner = await person(client, f"mentee-{i}-{j}", gender="m", languages=("en",))
            await match(client, learner)
            await choose(client, learner, m)
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await match(client, daniel)
    cards = (await client.get("/api/mentors/suggestions", headers=daniel.h)).json()
    assert [c["display_name"] for c in cards] == ["Brother-3", "Brother-0", "Brother-1"]


async def test_cmp03_r2_full_or_paused_mentor_is_not_suggested(client):
    full = await person(client, "full-mentor", roles=("mentor",), gender="m", languages=("en",))
    paused = await person(client, "paused-mentor", roles=("mentor",), gender="m", languages=("en",))
    await client.put("/api/inbox/profile", json={"capacity": 1}, headers=full.h)
    await client.put("/api/inbox/profile", json={"accepting": False}, headers=paused.h)
    first = await person(client, "first-1", gender="m", languages=("en",))
    await match(client, first)
    await choose(client, first, full)
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await match(client, daniel)
    assert (await client.get("/api/mentors/suggestions", headers=daniel.h)).json() == []
    assert (await client.post("/api/mentors/choose", json={"mentor_id": str(full.id)}, headers=daniel.h)).status_code == 409


async def test_cmp03_r2_no_mentor_available_returns_empty(client):
    await person(client, "en-sister", roles=("mentor",), gender="f", languages=("en",))
    maria = await person(client, "maria-1", gender=None, languages=("tl",), locale="tl")
    r = await client.get("/api/mentors/suggestions", headers=maria.h)
    assert r.status_code == 409 and r.json()["detail"] == "match_profile_required"  # asked only now
    await match(client, maria, gender="f", languages=("tl",))
    assert (await client.get("/api/mentors/suggestions", headers=maria.h)).json() == []


# R3 -----------------------------------------------------------------------


async def test_cmp03_r3_card_shows_no_username_or_contact(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",), display_name="Abu Abdullah")
    await client.put("/api/inbox/profile", json={"about": "Volunteer, converted 10 years ago", "availability": "Evenings"}, headers=abu.h)
    assert (await client.put("/api/inbox/profile", json={"about": "whatsapp me 0551234567"}, headers=abu.h)).status_code == 422
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await match(client, daniel)
    card = (await client.get("/api/mentors/suggestions", headers=daniel.h)).json()[0]
    assert set(card) == {"id", "display_name", "languages", "about", "availability"}
    assert "abu-abdullah" not in str(card)


# R4 -----------------------------------------------------------------------


async def test_cmp03_r4_changing_mentor_removes_old_and_resets_permission(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    yusuf = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await match(client, daniel)
    await choose(client, daniel, abu)
    await client.put("/api/mentors/mine/share", json={"share": True}, headers=daniel.h)
    mine = await choose(client, daniel, yusuf)
    assert mine["mentor"]["id"] == str(yusuf.id) and mine["share_progress"] is False
    assert await mentee_ids(client, abu) == []
    assert await mentee_ids(client, yusuf) == [str(daniel.id)]


async def test_cmp03_r4_ending_leaves_no_mentor(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await match(client, daniel)
    await choose(client, daniel, abu)
    assert (await client.delete("/api/mentors/mine", headers=daniel.h)).status_code == 204
    assert (await client.get("/api/mentors/mine", headers=daniel.h)).json()["mentor"] is None
    assert await mentee_ids(client, abu) == []


# R5 -----------------------------------------------------------------------


async def test_cmp03_r5_mentor_is_notified_and_sees_welcome_flag(client, pushes):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    await match(client, daniel)
    await choose(client, daniel, abu)
    await settle()
    assert [p["title"] for uid, p in pushes if uid == str(abu.id)] == ["A new learner chose you"]
    assert "Daniel" not in str(pushes)
    assert (await client.get("/api/inbox/mentees", headers=abu.h)).json()[0]["needs_welcome"] is True


async def test_cmp03_r5_first_message_clears_welcome_flag(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await match(client, daniel)
    await choose(client, daniel, abu)
    thread = (await client.post(f"/api/inbox/mentees/{daniel.id}/thread", headers=abu.h)).json()
    await client.post(f"/api/inbox/requests/{thread['id']}/messages", json={"body": "Welcome Daniel, how are you feeling?"}, headers=abu.h)
    assert (await client.get("/api/inbox/mentees", headers=abu.h)).json()[0]["needs_welcome"] is False


# R6 -----------------------------------------------------------------------


async def test_cmp03_r6_private_thread_reaches_own_mentor_only(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    other = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await match(client, daniel)
    await choose(client, daniel, abu)
    tid = (await client.post("/api/mentors/mine/thread", headers=daniel.h)).json()["id"]
    await client.post(f"/api/help/requests/{tid}/messages", json={"body": "I have a question about work"}, headers=daniel.h)
    rows = (await client.get("/api/inbox/requests", headers=abu.h)).json()
    assert [(r["id"], r["kind"]) for r in rows] == [(tid, "mentor")]
    assert (await client.get("/api/inbox/requests", headers=other.h)).json() == []
    assert (await client.get(f"/api/inbox/requests/{tid}", headers=other.h)).status_code == 404


async def test_cmp03_r6_share_progress_is_off_until_turned_on(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await match(client, daniel)
    mine = await choose(client, daniel, abu)
    assert mine["share_progress"] is False
    on = (await client.put("/api/mentors/mine/share", json={"share": True}, headers=daniel.h)).json()
    assert on["share_progress"] is True
