"""CMP-03 R4 (audit 2026-10-06, HIGH): once a link ends (the learner changes
or ends the mentor, blocks him, or he is suspended or loses approval), the
former mentor never sees the learner's new words or the old thread again,
even after reinstatement. Writing in the old thread goes to the current
mentor's thread, or to the shared pool under CMP-01 R3. The learner's open
human/escalation requests move to the new mentor or back to the pool."""

import pytest
from sqlalchemy import select

from app.companion.models import HelpRequest
from app.core.db import SessionLocal
from app.core.events import publish
from tests.cmp_helpers import person, record_pushes, settle
from tests.org_helpers import make_org
from tests.test_org02_mentors import org_mentor


@pytest.fixture
def pushes(monkeypatch):
    return record_pushes(monkeypatch)


async def choose(client, who, mentor):
    r = await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=who.h)
    assert r.status_code == 200, r.text
    return r.json()


async def old_thread(client, learner, mentor) -> str:
    """Learner and mentor talk in their private thread; returns its id."""
    tid = (await client.post("/api/mentors/mine/thread", headers=learner.h)).json()["id"]
    assert (
        await client.post(f"/api/help/requests/{tid}/messages", json={"body": "Salam, a question"}, headers=learner.h)
    ).status_code == 201
    r = await client.post(f"/api/inbox/requests/{tid}/messages", json={"body": "Wa alaykum salam"}, headers=mentor.h)
    assert r.status_code == 201, r.text
    return tid


async def write(client, learner, tid: str, body: str) -> dict:
    r = await client.post(f"/api/help/requests/{tid}/messages", json={"body": body}, headers=learner.h)
    assert r.status_code == 201, r.text
    return r.json()


async def sees_nothing_of(client, mentor, learner, *ids: str, words: str) -> None:
    """The former mentor: no row of the learner's, the threads are 404, the words nowhere."""
    rows = (await client.get("/api/inbox/requests", headers=mentor.h)).json()
    assert all(r["handle"] != learner.display_name for r in rows), rows
    assert words not in str(rows)
    for rid in ids:
        assert (await client.get(f"/api/inbox/requests/{rid}", headers=mentor.h)).status_code == 404
        assert (await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "hello?"}, headers=mentor.h)).status_code == 404


async def learner_still_reads(client, learner, tid: str) -> dict:
    t = (await client.get(f"/api/help/requests/{tid}", headers=learner.h)).json()
    assert [m["body"] for m in t["messages"]] == ["Salam, a question", "Wa alaykum salam"]
    assert t["status"] == "closed" and t["link_ended"] is True
    return t


# R4 ex1: changing the mentor -------------------------------------------------


async def test_cmp03_r4_writing_in_old_thread_after_change_goes_to_new_mentor_only(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    yusuf = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    await choose(client, daniel, abu)
    tid = await old_thread(client, daniel, abu)
    mine = await choose(client, daniel, yusuf)
    assert mine["share_progress"] is False  # R4 ex1: permission closed with the new mentor

    went = await write(client, daniel, tid, "Back again with news")
    new_tid = (await client.get("/api/mentors/mine", headers=daniel.h)).json()["thread_id"]
    assert went["id"] == new_tid != tid and went["kind"] == "mentor"
    await sees_nothing_of(client, abu, daniel, tid, new_tid, words="Back again with news")
    seen = (await client.get(f"/api/inbox/requests/{new_tid}", headers=yusuf.h)).json()
    assert [m["body"] for m in seen["messages"]] == ["Back again with news"]  # not the old history
    await learner_still_reads(client, daniel, tid)


# R4 ex2: ending without choosing another --------------------------------------


async def test_cmp03_r4_writing_in_old_thread_after_ending_goes_to_the_pool(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    brother = await person(client, "other-brother", roles=("mentor",), gender="m", languages=("en",))
    sister = await person(client, "a-sister", roles=("mentor",), gender="f", languages=("en",))
    arabic = await person(client, "arabic-brother", roles=("mentor",), gender="m", languages=("ar",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    await choose(client, daniel, abu)
    tid = await old_thread(client, daniel, abu)
    assert (await client.delete("/api/mentors/mine", headers=daniel.h)).status_code == 204

    went = await write(client, daniel, tid, "I need someone to talk to")
    assert went["id"] != tid and went["kind"] == "human" and went["status"] == "open" and went["gender"] == "m"
    assert went["source"] is None  # not «من مستفيديك»: he has no mentor now
    await sees_nothing_of(client, abu, daniel, tid, went["id"], words="I need someone to talk to")
    # CMP-01 R3: the pool of his own gender and language
    assert [r["id"] for r in (await client.get("/api/inbox/requests", headers=brother.h)).json()] == [went["id"]]
    assert (await client.get("/api/inbox/requests", headers=sister.h)).json() == []
    assert (await client.get("/api/inbox/requests", headers=arabic.h)).json() == []
    await learner_still_reads(client, daniel, tid)
    # The old thread is listed for him, still closed; a second word starts no new reopening.
    listed = {r["id"]: r["status"] for r in (await client.get("/api/help/requests", headers=daniel.h)).json()}
    assert listed[tid] == "closed" and listed[went["id"]] == "open"


async def test_cmp03_r4_former_mentor_does_not_see_the_learners_later_pool_requests(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    brother = await person(client, "other-brother", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    await choose(client, daniel, abu)  # never wrote: the link alone is enough
    assert (await client.delete("/api/mentors/mine", headers=daniel.h)).status_code == 204
    r = await client.post("/api/help/requests", json={"kind": "human", "lang": "en", "body": "A new question"}, headers=daniel.h)
    rid = r.json()["request"]["id"]
    await sees_nothing_of(client, abu, daniel, rid, words="A new question")
    assert [x["id"] for x in (await client.get("/api/inbox/requests", headers=brother.h)).json()] == [rid]
    # The record of the ended link is not listed to the learner as an empty conversation.
    assert [x["id"] for x in (await client.get("/api/help/requests", headers=daniel.h)).json()] == [rid]
    # Choosing him again makes him the mentor again: his own mentee's pool request shows.
    await choose(client, daniel, abu)
    assert rid in [x["id"] for x in (await client.get("/api/inbox/requests", headers=abu.h)).json()]


async def test_cmp03_r4_urgent_keeps_danger_routing_for_everyone(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await choose(client, daniel, abu)
    assert (await client.delete("/api/mentors/mine", headers=daniel.h)).status_code == 204
    r = await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en"}, headers=daniel.h)
    rid = r.json()["request"]["id"]
    assert rid in [x["id"] for x in (await client.get("/api/inbox/requests", headers=abu.h)).json()]  # rules.md §2.8


# Suspension, approval withdrawn, then reinstatement (ORG-02 R5) ---------------


@pytest.mark.parametrize("how", ["suspend", "revoke"])
async def test_cmp03_r4_reinstated_mentor_never_gets_the_learner_back(client, pushes, how):
    org = await make_org(client)
    abu = await org_mentor(client, org, "abu-abdullah", gender="m", languages=("en",))
    brother = await person(client, "other-brother", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    await choose(client, daniel, abu)
    tid = await old_thread(client, daniel, abu)
    co = org.coordinator.h
    if how == "suspend":
        assert (await client.post(f"/api/org/{org.id}/mentors/{abu.id}/suspend", headers=co)).status_code == 204
        assert (await client.post(f"/api/org/{org.id}/mentors/{abu.id}/reinstate", headers=co)).status_code == 204
    else:  # approval withdrawn, later approved again (e.g. by another office)
        assert (await client.delete(f"/api/org/{org.id}/mentors/{abu.id}", headers=co)).status_code == 204
        async with SessionLocal() as s:
            await publish(s, "MentorApproved", "ORG", {"mentor_id": str(abu.id)})
            await s.commit()
    await settle()

    went = await write(client, daniel, tid, "Are you there?")
    assert went["id"] != tid and went["kind"] == "human"
    assert (await client.get("/api/inbox/requests", headers=abu.h)).status_code == 200  # his inbox is back
    await sees_nothing_of(client, abu, daniel, tid, went["id"], words="Are you there?")
    assert [r["id"] for r in (await client.get("/api/inbox/requests", headers=brother.h)).json()] == [went["id"]]
    await learner_still_reads(client, daniel, tid)


# R4: the learner's open requests follow the link -------------------------------


async def held_by(request_id: str):
    async with SessionLocal() as s:
        return await s.scalar(select(HelpRequest.mentor_id).where(HelpRequest.id == request_id))


async def ask_own_mentor(client, learner, body: str, lang="en", kind="human") -> str:
    r = await client.post("/api/help/requests", json={"kind": kind, "lang": lang, "body": body}, headers=learner.h)
    assert r.status_code == 201, r.text
    return r.json()["request"]["id"]


async def test_cmp03_r4_open_requests_move_to_the_new_mentor(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    yusuf = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en", "ar"), display_name="Daniel")
    await choose(client, daniel, abu)
    open_en = await ask_own_mentor(client, daniel, "How do I pray?")  # CMP-02 R3: own mentor first
    escalated = await ask_own_mentor(client, daniel, "A question from Ask", kind="escalation")
    answered = await ask_own_mentor(client, daniel, "About my family")
    await client.post(f"/api/inbox/requests/{answered}/messages", json={"body": "Let us talk"}, headers=abu.h)
    open_ar = await ask_own_mentor(client, daniel, "سؤال بالعربية", lang="ar")  # Yusuf has no Arabic
    assert await held_by(open_en) == abu.id

    await choose(client, daniel, yusuf)
    assert await held_by(open_en) == yusuf.id
    assert await held_by(escalated) == yusuf.id
    assert await held_by(answered) == yusuf.id
    assert await held_by(open_ar) is None  # CMP-01 R3: the pool, in its language
    ids = {r["id"] for r in (await client.get("/api/inbox/requests", headers=yusuf.h)).json()}
    assert {open_en, escalated, answered} <= ids and open_ar not in ids
    await sees_nothing_of(client, abu, daniel, open_en, escalated, answered, open_ar, words="How do I pray?")


async def test_cmp03_r4_ending_returns_open_and_closed_requests_to_the_pool(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    brother = await person(client, "other-brother", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    await choose(client, daniel, abu)
    rid = await ask_own_mentor(client, daniel, "How do I pray?")
    done = await ask_own_mentor(client, daniel, "An old question")
    await client.post(f"/api/inbox/requests/{done}/messages", json={"body": "Answered"}, headers=abu.h)
    assert (await client.post(f"/api/inbox/requests/{done}/close", headers=abu.h)).status_code == 200

    assert (await client.delete("/api/mentors/mine", headers=daniel.h)).status_code == 204
    assert await held_by(rid) is None and await held_by(done) is None
    assert rid in [r["id"] for r in (await client.get("/api/inbox/requests", headers=brother.h)).json()]
    # Writing in the closed one reopens it to the pool, never to the former mentor.
    await write(client, daniel, done, "One more thing")
    assert done in [r["id"] for r in (await client.get("/api/inbox/requests", headers=brother.h)).json()]
    await sees_nothing_of(client, abu, daniel, rid, done, words="One more thing")


async def test_cmp03_r4_urgent_request_held_by_old_mentor_keeps_its_routing(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    yusuf = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await choose(client, daniel, abu)
    rid = (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en"}, headers=daniel.h)).json()["request"]["id"]
    await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "I am here for you"}, headers=abu.h)
    await choose(client, daniel, yusuf)
    assert await held_by(rid) == abu.id  # untouched: urgent goes to the first available person
    # Security review B-M3: an answered urgent request is its holder's and the team's.
    assert rid in [r["id"] for r in (await client.get("/api/inbox/requests", headers=abu.h)).json()]
    assert rid not in [r["id"] for r in (await client.get("/api/inbox/requests", headers=yusuf.h)).json()]


# Blocking still behaves as before (CMP-04 R6) ----------------------------------


async def test_cmp03_r4_blocking_mentor_still_releases_and_ends(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    brother = await person(client, "other-brother", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",), display_name="Daniel")
    await choose(client, daniel, abu)
    tid = await old_thread(client, daniel, abu)
    rid = await ask_own_mentor(client, daniel, "How do I pray?")
    assert (await client.post("/api/mentors/mine/block", headers=daniel.h)).status_code == 204
    assert (await client.get("/api/mentors/mine", headers=daniel.h)).json()["mentor"] is None
    assert await held_by(rid) is None
    assert rid in [r["id"] for r in (await client.get("/api/inbox/requests", headers=brother.h)).json()]
    went = await write(client, daniel, tid, "After the block")
    assert went["id"] != tid
    await sees_nothing_of(client, abu, daniel, tid, rid, went["id"], words="After the block")
    # Blocked: he is never suggested again (unchanged).
    assert str(abu.id) not in (await client.get("/api/mentors/suggestions", headers=daniel.h)).text


async def test_cmp03_r4_blocking_from_the_thread_releases_his_other_requests(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    brother = await person(client, "other-brother", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await choose(client, daniel, abu)
    tid = await old_thread(client, daniel, abu)
    rid = await ask_own_mentor(client, daniel, "How do I pray?")
    assert (await client.post(f"/api/help/requests/{tid}/block", headers=daniel.h)).status_code == 204
    assert (await client.get("/api/mentors/mine", headers=daniel.h)).json()["mentor"] is None
    assert await held_by(rid) is None
    assert rid in [r["id"] for r in (await client.get("/api/inbox/requests", headers=brother.h)).json()]


async def test_cmp03_r4_live_thread_still_reopens_to_own_mentor(client, pushes):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await person(client, "daniel-1", gender="m", languages=("en",))
    await choose(client, daniel, abu)
    tid = await old_thread(client, daniel, abu)
    assert (await client.post(f"/api/inbox/requests/{tid}/close", headers=abu.h)).status_code == 200
    went = await write(client, daniel, tid, "Still there?")
    assert went["id"] == tid and went["status"] == "open"  # CMP-02 R4 unchanged with a live link
    t = (await client.get(f"/api/help/requests/{tid}", headers=daniel.h)).json()
    assert t["link_ended"] is False
    assert tid in [r["id"] for r in (await client.get("/api/inbox/requests", headers=abu.h)).json()]
