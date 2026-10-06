"""MOT-08 R6 / CMP-02 R7: Companion publishes MentorContacted {user_id} when a
learner's own mentor writes to them (owner approval 2026-10-06)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.companion.models import HelpRequest
from app.core.db import SessionLocal
from app.core.events import OutboxEvent, publish
from app.motivation.models import DailySnapshot
from app.motivation.router import RIYADH
from tests.cmp_helpers import person

EVENT = "MentorContacted"


async def contacted() -> list[OutboxEvent]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(OutboxEvent).where(OutboxEvent.name == EVENT)))


async def mentee(client, mentor, username="daniel-1", share=True):
    learner = await person(client, username, gender="m", languages=("en",))
    await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en"]}, headers=learner.h)
    r = await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=learner.h)
    assert r.status_code == 200, r.text
    if share:
        assert (await client.put("/api/mentors/mine/share", json={"share": True}, headers=learner.h)).status_code == 200
    return learner


async def write(client, who, request_id, body="Assalamu alaikum, how are you?"):
    r = await client.post(f"/api/inbox/requests/{request_id}/messages", json={"body": body}, headers=who.h)
    assert r.status_code == 201, r.text


async def thread_of(client, mentor, learner) -> str:
    r = await client.post(f"/api/inbox/mentees/{learner.id}/thread", headers=mentor.h)
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def ask(client, who=None, **body) -> str:
    json = {"lang": "en", "body": "I need someone", "gender": "m", **body}
    r = await client.post("/api/help/requests", json=json, headers=who.h if who else {})
    assert r.status_code == 201, r.text
    return r.json()["request"]["id"]


async def test_mot08_r6_mentor_message_to_mentee_publishes_one_event_a_day(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await mentee(client, abu)
    tid = await thread_of(client, abu, daniel)
    await write(client, abu, tid)
    await write(client, abu, tid, "Did you finish the wudu lesson?")  # same day: no second event
    events = await contacted()
    assert [(e.source, e.payload) for e in events] == [("CMP", {"user_id": str(daniel.id)})]
    # the next Riyadh day counts again
    async with SessionLocal() as s:
        await s.execute(update(OutboxEvent).where(OutboxEvent.name == EVENT).values(created_at=datetime.now(UTC) - timedelta(days=1)))
        await s.commit()
    await write(client, abu, tid, "Good morning")
    assert len(await contacted()) == 2


async def test_mot08_r6_mentor_answering_his_mentees_help_request_counts(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await mentee(client, abu)
    rid = await ask(client, daniel)  # goes to his own mentor first (CMP-02 R3)
    await write(client, abu, rid)
    assert [e.payload["user_id"] for e in await contacted()] == [str(daniel.id)]


async def test_mot08_r6_learner_not_sharing_progress_sends_nothing(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await mentee(client, abu, share=False)
    await write(client, abu, await thread_of(client, abu, daniel))
    assert await contacted() == []


async def test_mot08_r6_team_member_reply_sends_nothing(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    team = await person(client, "team-one", roles=("team",), gender="m", languages=("en",))
    daniel = await mentee(client, abu)
    rid = await ask(client, daniel)
    async with SessionLocal() as s:  # unanswered for 25 h: the pool sees it (CMP-02 R3 ex2)
        t = datetime.now(UTC) - timedelta(hours=25)
        await s.execute(update(HelpRequest).where(HelpRequest.id == uuid.UUID(rid)).values(created_at=t, last_activity_at=t))
        await s.commit()
    await write(client, team, rid)
    assert await contacted() == []


async def test_mot08_r6_guest_and_non_mentee_send_nothing(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await write(client, abu, await ask(client))  # a guest: no account
    joseph = await person(client, "joseph-1", gender="m", languages=("en",))
    await write(client, abu, await ask(client, joseph))  # an account, but not his mentee
    yusuf = await person(client, "yusuf-m", roles=("mentor",), gender="m", languages=("en",))
    daniel = await mentee(client, yusuf)  # another mentor's mentee, after the day without reply
    rid = await ask(client, daniel)
    async with SessionLocal() as s:
        t = datetime.now(UTC) - timedelta(hours=25)
        await s.execute(update(HelpRequest).where(HelpRequest.id == uuid.UUID(rid)).values(created_at=t, last_activity_at=t))
        await s.commit()
    await write(client, abu, rid)
    assert await contacted() == []


async def test_mot08_r6_scholar_answer_sends_nothing(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    reviewer = await person(client, "muhannad", roles=("sharia_reviewer",), gender="m", languages=("ar",))
    daniel = await mentee(client, abu)
    tid = (await client.post("/api/mentors/mine/thread", headers=daniel.h)).json()["id"]
    await client.post(f"/api/help/requests/{tid}/messages", json={"body": "Is my shahada valid?"}, headers=daniel.h)
    thread = (await client.get(f"/api/inbox/requests/{tid}", headers=abu.h)).json()
    mid = [m["id"] for m in thread["messages"] if m["author"] == "learner"][0]
    assert (await client.post(f"/api/inbox/requests/{tid}/refer", json={"message_id": mid}, headers=abu.h)).status_code == 201
    item = (await client.get("/api/referrals", headers=reviewer.h)).json()[0]
    assert (await client.post(f"/api/referrals/{item['id']}/answer", json={"body": "Yes."}, headers=reviewer.h)).status_code == 200
    assert await contacted() == []


async def test_mot08_r6_account_deletion_removes_the_event(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await mentee(client, abu)
    await write(client, abu, await thread_of(client, abu, daniel))
    assert len(await contacted()) == 1
    assert (await client.delete("/api/me", headers=daniel.h)).status_code == 204
    assert await contacted() == []


async def test_mot08_r6_indicators_count_the_contacted_learner(client):
    team = await person(client, "team-one", roles=("team",), gender="m", languages=("en",))
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    daniel = await mentee(client, abu)
    await write(client, abu, await thread_of(client, abu, daniel))  # the real event, through Companion
    others = [str(uuid.uuid4()) for _ in range(9)]  # nine more contacted learners
    reached = [str(daniel.id), *others]
    alone = [str(uuid.uuid4()) for _ in range(10)]
    today = datetime.now(UTC).astimezone(RIYADH).date()
    start = {f"u:{u}": "at_risk" for u in reached + alone}
    later = {f"u:{u}": "active" for u in reached[:5] + alone[:2]}
    async with SessionLocal() as s:
        for uid in others:
            await publish(s, EVENT, "CMP", {"user_id": uid})
        s.add(DailySnapshot(day=today - timedelta(days=7), counts={"at_risk": 20}, transitions=start))
        s.add(DailySnapshot(day=today, counts={"active": 7, "at_risk": 13}, transitions=later))
        await s.commit()
    body = (await client.get("/api/team/indicators?days=7", headers=team.h)).json()
    assert body["mentor_contact"] == {"contacted": 0.5, "not_contacted": 0.2}
    # without Daniel's event only 9 were contacted: not enough data
    async with SessionLocal() as s:
        await s.execute(
            OutboxEvent.__table__.delete().where(OutboxEvent.name == EVENT, OutboxEvent.payload["user_id"].astext == str(daniel.id))
        )
        await s.commit()
    body = (await client.get("/api/team/indicators?days=7", headers=team.h)).json()
    assert body["mentor_contact"] == {"contacted": None, "not_contacted": None}
