"""Security review B, low findings.

L9  (CMP-04 R2): one person cannot hide message after message for everyone.
L10 (CMP-08 R2): knowing a contact is not enough to overwrite its pending application.
L11 (CMP-04 R1): a mentor whose inbox is closed (rules not accepted, suspended)
     cannot report a learner's message.
Contacts here are made up (example.com)."""

from sqlalchemy import select, update

from app.companion.models import MentorApplication, MentorProfile
from app.core import limits, ratelimit
from app.core.db import SessionLocal
from app.platform.models import User
from tests.cmp_helpers import bodies, group_with, person, say

APPLY = "/api/mentor-applications"
EMAIL = "volunteer@example.com"


async def report(client, who, target_id, reason, target_type="group_message", headers=None):
    return await client.post(
        "/api/reports", json={"target_type": target_type, "target_id": target_id, "reason": reason}, headers=headers or who.h
    )


async def sisters(client, n: int):
    mentor = await person(client, "umm-yusuf", roles=("mentor",), gender="f", languages=("en",))
    members = [await person(client, f"sister-{i}", gender="f", languages=("en",)) for i in range(n)]
    g = await group_with(client, mentor, *members)
    return mentor, members, g


# --- L9 -------------------------------------------------------------------------


async def test_l9_one_reporter_hides_a_few_messages_for_everyone_a_day_not_more(client):
    assert limits.get("report_hides_per_reporter_day") == 5  # default; admin-editable (plt-admin-limits)
    mentor, members, g = await sisters(client, 8)
    reporter, reader, authors = members[0], members[1], members[2:]
    team = await person(client, "team-one", roles=("team",))
    mids = [await say(client, a, g["id"], f"A normal message {i}") for i, a in enumerate(authors)]  # six authors

    results = []
    for mid in mids:
        r = await report(client, reporter, mid, "money")
        assert r.status_code == 201, r.text
        results.append(r.json()["hidden_for_all"])

    assert results == [True] * 5 + [False]
    assert await bodies(client, reader, g["id"]) == ["A normal message 5"]  # the sixth stays for the others
    assert "A normal message 5" not in await bodies(client, reporter, g["id"])  # hidden for the reporter herself (R2)
    # Every report still reaches the team, high priority.
    q = (await client.get("/api/team/reports", headers=team.h)).json()
    assert len(q) == 6 and {i["priority"] for i in q} == {"high"}


async def test_l9_one_reporter_cannot_silence_one_person(client):
    assert limits.get("report_hides_per_author_day") == 2
    mentor, (reporter, target, reader), g = await sisters(client, 3)
    mids = [await say(client, target, g["id"], f"My message {i}") for i in range(4)]

    results = [(await report(client, reporter, mid, "recruitment")).json()["hidden_for_all"] for mid in mids]

    assert results == [True, True, False, False]
    assert await bodies(client, reader, g["id"]) == ["My message 2", "My message 3"]


async def test_l9_another_member_can_still_hide_a_message_of_the_same_person(client):
    mentor, (reporter, target, second), g = await sisters(client, 3)
    mids = [await say(client, target, g["id"], f"My message {i}") for i in range(3)]
    for mid in mids:
        await report(client, reporter, mid, "marriage")
    r = await report(client, second, mids[2], "marriage")
    assert r.json()["hidden_for_all"] is True


async def test_l9_a_message_the_team_restored_is_not_hidden_again_by_a_report(client):
    mentor, (reporter, target, reader), g = await sisters(client, 3)
    team = await person(client, "team-one", roles=("team",))
    mid = await say(client, target, g["id"], "Zakat is one of the pillars")
    assert (await report(client, reporter, mid, "money")).json()["hidden_for_all"] is True
    rid = (await client.get("/api/team/reports", headers=team.h)).json()[0]["id"]
    assert (await client.post(f"/api/team/reports/{rid}", json={"action": "restore"}, headers=team.h)).status_code == 200

    for who in (reporter, reader):
        r = await report(client, who, mid, "money")
        assert r.status_code == 201 and r.json()["hidden_for_all"] is False

    assert "Zakat is one of the pillars" in await bodies(client, target, g["id"])
    assert len((await client.get("/api/team/reports", headers=team.h)).json()) == 2  # the team still hears about it


async def test_l9_caps_hold_for_a_responders_reports_in_a_help_thread(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    out = (await client.post("/api/help/requests", json={"lang": "en", "gender": "m", "body": "First words"})).json()
    rid, owner = out["request"]["id"], {"X-Help-Token": out["guest_token"]}
    for i in range(2):
        await client.post(f"/api/help/requests/{rid}/messages", json={"body": f"More words {i}"}, headers=owner)
    thread = (await client.get(f"/api/inbox/requests/{rid}", headers=abu.h)).json()
    mids = [m["id"] for m in thread["messages"]]

    results = [(await report(client, abu, mid, "money", target_type="help_message")).json()["hidden_for_all"] for mid in mids]

    assert results == [True, True, False]


# --- L10 ------------------------------------------------------------------------


def form(**over) -> dict:
    body = {
        "display_name": "Umm Yusuf",
        "gender": "f",
        "languages": ["en"],
        "locale": "en",
        "about": "I have looked after new Muslim sisters in my neighbourhood for three years.",
        "contact": EMAIL,
        "rules_accepted": True,
    }
    body.update(over)
    return body


async def apply(client, headers=None, **over):
    ratelimit.reset()
    return await client.post(APPLY, json=form(**over), headers=headers or {})


async def rows() -> list[MentorApplication]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(MentorApplication).order_by(MentorApplication.created_at)))


async def test_l10_a_second_submission_with_the_same_contact_does_not_overwrite_the_first(client):
    first = await apply(client)
    second = await apply(client, display_name="Someone Else", gender="m", about="Replace her words with mine.")

    assert (first.status_code, first.json()) == (second.status_code, second.json()) == (201, {"received": True, "keep_days": 90})
    (row,) = await rows()
    assert (row.display_name, row.gender) == ("Umm Yusuf", "f")
    assert row.about == "I have looked after new Muslim sisters in my neighbourhood for three years."


async def test_l10_an_account_cannot_take_over_a_pending_application_by_its_contact(client):
    await apply(client)
    intruder = await person(client, "intruder-1")

    r = await apply(client, headers=intruder.h, display_name="Intruder", gender="m", contact=EMAIL)

    assert (r.status_code, r.json()) == (201, {"received": True, "keep_days": 90})
    (row,) = await rows()
    assert row.user_id is None and row.display_name == "Umm Yusuf" and row.gender == "f"
    assert (await client.get(f"{APPLY}/mine", headers=intruder.h)).json() is None


async def test_l10_an_applicant_signed_in_still_replaces_her_own_pending_application(client):
    maryam = await person(client, "maryam-1")
    await apply(client, headers=maryam.h, contact=None)
    await apply(client, headers=maryam.h, contact=None, about="A better description of my experience.")
    (row,) = await rows()
    assert row.user_id == maryam.id and row.about == "A better description of my experience."


async def test_l10_her_own_update_is_kept_when_the_contact_is_also_on_another_pending_application(client):
    """Follow-up: a signed-in applicant's own pending application is found by
    her account, whatever other pending application carries the same contact."""
    other = await apply(client)  # someone else, not signed in, same contact
    maryam = await person(client, "maryam-1")
    await apply(client, headers=maryam.h, contact=None, display_name="Maryam")

    r = await apply(client, headers=maryam.h, contact=EMAIL, display_name="Maryam", about="A better description of my experience.")

    assert (r.status_code, r.json()) == (other.status_code, other.json()) == (201, {"received": True, "keep_days": 90})
    by_account = {row.user_id: row for row in await rows()}
    assert set(by_account) == {None, maryam.id}  # still two applications, none taken over
    assert by_account[maryam.id].about == "A better description of my experience."
    assert by_account[None].display_name == "Umm Yusuf" and by_account[None].about.startswith("I have looked after")


# --- L11 ------------------------------------------------------------------------


async def urgent_with_words(client) -> tuple[str, str]:
    out = (await client.post("/api/help/requests", json={"kind": "urgent", "lang": "en", "body": "Please help me"})).json()
    rid = out["request"]["id"]
    async with SessionLocal() as s:
        from app.companion.models import HelpMessage

        mid = await s.scalar(select(HelpMessage.id).where(HelpMessage.request_id == rid))
    return rid, str(mid)


async def test_l11_a_mentor_who_has_not_accepted_the_rules_cannot_report_a_learners_message(client):
    newcomer = await person(client, "newcomer-1", gender="m", languages=("en",))
    async with SessionLocal() as s:  # the role without the mentor rules (ORG-02 R2): no inbox yet
        await s.execute(update(User).where(User.id == newcomer.id).values(roles=["mentor"]))
        await s.commit()
    assert (await client.get("/api/inbox/requests", headers=newcomer.h)).status_code == 403
    rid, mid = await urgent_with_words(client)

    r = await report(client, newcomer, mid, "money", target_type="help_message")

    assert r.status_code == 404, r.text
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    thread = (await client.get(f"/api/inbox/requests/{rid}", headers=abu.h)).json()
    assert [m["body"] for m in thread["messages"]] == ["Please help me"]  # not hidden from those who answer


async def test_l11_a_suspended_mentor_cannot_report_a_learners_message(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    rid, mid = await urgent_with_words(client)
    async with SessionLocal() as s:
        await s.execute(update(MentorProfile).where(MentorProfile.user_id == abu.id).values(suspended=True))
        await s.commit()

    r = await report(client, abu, mid, "money", target_type="help_message")

    assert r.status_code == 404, r.text


async def test_l11_a_mentor_in_good_standing_still_reports_a_learners_message(client):
    abu = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    rid, mid = await urgent_with_words(client)
    r = await report(client, abu, mid, "abuse", target_type="help_message")
    assert r.status_code == 201, r.text
