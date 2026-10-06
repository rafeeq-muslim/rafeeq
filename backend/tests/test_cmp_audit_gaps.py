"""CMP audit gaps (cmp-audit-gaps): the contact filter (CMP-01 R5), the
team's reminder of uncovered gender × language pairs (CMP-01 open question),
responders reporting a learner (CMP-04 R1), undoing a mentor's hide
(CMP-04 R4 ex3), the author seeing his hidden help message (CMP-04 R5), and
gender that a mentor or team member cannot switch alone (security)."""

import pytest

from app.companion.text import contact_violation
from tests.cmp_helpers import bodies, group_with, person, say
from tests.test_cmp01_help import ask_as_guest, guest, inbox_ids

# --- CMP-01 R5: contact filter -----------------------------------------------

# Obviously fake numbers and addresses only (the repo is public).
REFUSED = {
    "email": [
        "mail me daniel@example.com",
        "daniel @ example . com",
        "daniel at example dot com",
        "daniel (at) example [dot] com",
        "write to daniel at gmail",
    ],
    "link": [
        "join t.me/somegroup",
        "follow me on x.com/layla",
        "twitter.com/layla",
        "my page linkedin.com/in/layla",
        "threads.net/@layla",
        "kik.me/layla",
        "see https://example.org/page",
        "www.example.net",
        "visit example.sa",
    ],
    "handle": [
        "snap: layla_k",
        "Snapchat: laylak",
        "telegram: @layla",
        "add me on snap layla_99",
        "my insta is layla.k",
        "kik layla_k",
        "whatsapp: layla99",
        "سناب: layla99",
        "واتساب layla_99",
        "find me @layla_k",
    ],
    "phone": [
        "call me on 0551234567",
        "رقمي +966 55 123 4567",
        "رقمي ٠٥٥١٢٣٤٥٦٧",
        "رقمي ٠٥٥-١٢٣-٤٥٦٧",
        "call 555-1234",
        "555 1234",
        "(050) 123 4567",
        "0917 123 4567",
        "05.01.23.45.67",
    ],
}

ALLOWED = [
    "آية الكرسي 2:255",
    "البقرة ٢:٢٥٥",
    "البقرة 255-257",
    "Surah 2:255-257 and 3:18",
    "verses 255 256 257",
    "اليوم 1447/03/20",
    "on 2026-10-06",
    "سورة 2 آية 255",
    "السلام عليكم ورحمة الله، أريد أن أتعلم الوضوء",
    "I joined a telegram group",
    "I saw it on instagram today",
    "my telegram is broken",
    "I used gmail before",
    "He is at home. Then the mosque",
    "the first line: bismillah",
    "meet at 10:30",
    "1 2 3 4 5 6 7",
    "I have 7 brothers and 3 sisters",
    "e.g. this, i.e. that",
]


@pytest.mark.parametrize("kind,body", [(k, b) for k, bs in REFUSED.items() for b in bs])
def test_cmp01_r5_contact_filter_refuses(kind, body):
    assert contact_violation(body) == kind


@pytest.mark.parametrize("body", ALLOWED)
def test_cmp01_r5_contact_filter_leaves_arabic_and_quran_references(body):
    assert contact_violation(body) is None


async def test_cmp01_r5_handle_refused_with_reason(client):
    r = await client.post("/api/help/requests", json={"lang": "en", "body": "snap: layla_k", "gender": "f"})
    assert r.status_code == 422 and r.json()["detail"] == {"code": "contact_not_allowed", "kind": "handle"}


async def test_cmp01_r5_quran_reference_is_sent(client):
    out = await ask_as_guest(client, body="ما معنى البقرة 2:255؟")
    assert out["request"]["id"]


# --- CMP-01 open question: a sister and a brother per language ---------------


async def coverage(client, who):
    r = await client.get("/api/team/coverage", headers=who.h)
    assert r.status_code == 200, r.text
    return r.json()


async def test_cmp01_open_question_team_sees_uncovered_gender_language_pairs(client):
    team = await person(client, "team-one", roles=("team",), gender="m", languages=("ar", "en"))
    await person(client, "umm-sara", roles=("mentor",), gender="f", languages=("en",))
    paused = await person(client, "umm-maryam", roles=("mentor",), gender="f", languages=("tl",))
    r = await client.put("/api/inbox/profile", json={"accepting": False}, headers=paused.h)
    assert r.status_code == 200, r.text
    await person(client, "team-two", roles=("team",), gender=None)
    out = await coverage(client, team)
    cells = {(c["lang"], c["gender"]): (c["responders"], c["available"], c["covered"]) for c in out["cells"]}
    assert cells == {
        ("ar", "m"): (1, 1, True),
        ("ar", "f"): (0, 0, False),
        ("en", "m"): (1, 1, True),
        ("en", "f"): (1, 1, True),
        ("tl", "m"): (0, 0, False),
        ("tl", "f"): (1, 0, False),  # a paused mentor does not cover it
    }
    assert out["uncovered"] == 3
    assert out["without_gender"] == 1
    assert "umm" not in str(out)  # counts only


async def test_cmp01_open_question_coverage_is_team_only(client):
    mentor = await person(client, "umm-sara", roles=("mentor",), gender="f")
    learner = await person(client, "layla-1", gender="f")
    for who in (mentor, learner):
        assert (await client.get("/api/team/coverage", headers=who.h)).status_code == 403


# --- CMP-04 R1: the person answering reports the learner ---------------------


async def test_cmp04_r1_responder_reports_learner_message_in_help_thread(client):
    out = await ask_as_guest(client, body="hello", gender="m")
    rid = out["request"]["id"]
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "Welcome"}, headers=mentor.h)
    await client.post(f"/api/help/requests/{rid}/messages", json={"body": "Will you lend me money?"}, headers=guest(out["guest_token"]))
    thread = (await client.get(f"/api/inbox/requests/{rid}", headers=mentor.h)).json()
    mid = [m for m in thread["messages"] if m["author"] == "learner" and "money" in m["body"]][0]["id"]
    r = await client.post("/api/reports", json={"target_type": "help_message", "target_id": mid, "reason": "money"}, headers=mentor.h)
    assert r.status_code == 201 and r.json()["hidden_for_all"] is True
    team = await person(client, "team-one", roles=("team",))
    items = (await client.get("/api/team/reports", headers=team.h)).json()
    assert [(i["target_id"], i["reason"], i["priority"], i["place"]) for i in items] == [(mid, "money", "high", "help")]


async def test_cmp04_r1_mentor_reports_mentee_in_mentor_conversation(client):
    mentor = await person(client, "umm-sara", roles=("mentor",), gender="f", languages=("en",))
    layla = await person(client, "layla-1", gender="f", languages=("en",))
    assert (await client.post("/api/mentors/choose", json={"mentor_id": str(mentor.id)}, headers=layla.h)).status_code == 200
    tid = (await client.post("/api/mentors/mine/thread", headers=layla.h)).json()["id"]
    await client.post(f"/api/help/requests/{tid}/messages", json={"body": "My brother wants to marry you"}, headers=layla.h)
    mid = [m for m in (await client.get(f"/api/inbox/requests/{tid}", headers=mentor.h)).json()["messages"] if m["author"] == "learner"][0][
        "id"
    ]
    r = await client.post("/api/reports", json={"target_type": "help_message", "target_id": mid, "reason": "abuse"}, headers=mentor.h)
    assert r.status_code == 201 and r.json()["hidden_for_all"] is False
    # R2: another reason hides it for the reporter only; the learner still sees it as sent
    assert mid not in [m["id"] for m in (await client.get(f"/api/inbox/requests/{tid}", headers=mentor.h)).json()["messages"]]
    mine = [m for m in (await client.get(f"/api/help/requests/{tid}", headers=layla.h)).json()["messages"] if m["id"] == mid][0]
    assert mine["hidden"] is False


async def test_cmp04_r1_outsider_cannot_report_learner_message(client):
    out = await ask_as_guest(client, body="hello sisters", gender="f")
    rid = out["request"]["id"]
    sister = await person(client, "umm-sara", roles=("mentor",), gender="f", languages=("en",))
    mid = (await client.get(f"/api/inbox/requests/{rid}", headers=sister.h)).json()["messages"][0]["id"]
    brother = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    learner = await person(client, "joseph-1", gender="m")
    for who in (brother, learner):  # a brother never sees a sister's request; a learner answers nobody
        r = await client.post("/api/reports", json={"target_type": "help_message", "target_id": mid, "reason": "money"}, headers=who.h)
        assert r.status_code == 404


# --- CMP-04 R4 ex3: the team sees and undoes a mentor's hide -----------------


async def test_cmp04_r4_team_sees_mentor_hidden_record_and_restores_it(client):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    joseph = await person(client, "joseph-1", gender="m")
    daniel = await person(client, "daniel-1", gender="m")
    g = await group_with(client, mentor, joseph, daniel)
    mid = await say(client, joseph, g["id"], "a fair question the mentor misread")
    assert (await client.post(f"/api/groups/{g['id']}/messages/{mid}/hide", headers=mentor.h)).status_code == 204
    team = await person(client, "team-one", roles=("team",))
    assert (await client.get("/api/team/reports", headers=team.h)).json() == []  # nothing waits for review
    history = (await client.get("/api/team/reports?include_closed=true", headers=team.h)).json()
    rec = [i for i in history if i["reason"] == "mentor_hidden"][0]
    assert (rec["target_id"], rec["status"], rec["hidden"]) == (mid, "actioned", True)
    r = await client.post(f"/api/team/reports/{rec['id']}", json={"action": "restore"}, headers=team.h)
    assert r.json()["status"] == "dismissed" and r.json()["hidden"] is False
    assert "a fair question the mentor misread" in await bodies(client, daniel, g["id"])


# --- CMP-04 R5: the author of a hidden help message sees it marked -----------


async def test_cmp04_r5_mentor_sees_own_hidden_help_message_marked(client):
    out = await ask_as_guest(client, body="hello", gender="m")
    rid = out["request"]["id"]
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "Send me 100 riyals"}, headers=mentor.h)
    token = guest(out["guest_token"])
    mid = [m for m in (await client.get(f"/api/help/requests/{rid}", headers=token)).json()["messages"] if m["author"] == "mentor"][0]["id"]
    await client.post("/api/reports", json={"target_type": "help_message", "target_id": mid, "reason": "money"}, headers=token)
    msgs = (await client.get(f"/api/inbox/requests/{rid}", headers=mentor.h)).json()["messages"]
    mine = [m for m in msgs if m["id"] == mid][0]
    assert mine["hidden"] is True and mine["mine"] is True


async def test_cmp04_r5_learner_sees_own_hidden_help_message_marked(client):
    out = await ask_as_guest(client, body="hello", gender="m")
    rid = out["request"]["id"]
    token = guest(out["guest_token"])
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    await client.post(f"/api/inbox/requests/{rid}/messages", json={"body": "Welcome"}, headers=mentor.h)
    await client.post(f"/api/help/requests/{rid}/messages", json={"body": "Marry my sister"}, headers=token)
    mid = [m for m in (await client.get(f"/api/inbox/requests/{rid}", headers=mentor.h)).json()["messages"] if "Marry" in m["body"]][0][
        "id"
    ]
    await client.post("/api/reports", json={"target_type": "help_message", "target_id": mid, "reason": "marriage"}, headers=mentor.h)
    mine = [m for m in (await client.get(f"/api/help/requests/{rid}", headers=token)).json()["messages"] if m["id"] == mid][0]
    assert mine["hidden"] is True and mine["author"] == "me"
    # the person who reported does not see it any more, and nobody is named
    assert mid not in [m["id"] for m in (await client.get(f"/api/inbox/requests/{rid}", headers=mentor.h)).json()["messages"]]


# --- Security: a mentor's or team member's gender ----------------------------


async def test_cmp_security_mentor_cannot_switch_gender_alone(client):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    r = await client.put("/api/mentors/me/match", json={"gender": "f", "languages": ["en"]}, headers=mentor.h)
    assert r.status_code == 403 and r.json()["detail"] == "gender_locked"
    r = await client.patch("/api/me", json={"gender": "f"}, headers=mentor.h)
    assert r.status_code == 403
    # the same gender is fine (the form sends it again with languages)
    r = await client.put("/api/mentors/me/match", json={"gender": "m", "languages": ["en", "ar"]}, headers=mentor.h)
    assert r.status_code == 200 and r.json()["gender"] == "m"
    # a sister's request stays out of his inbox
    out = await ask_as_guest(client, body="hello", gender="f")
    assert out["request"]["id"] not in await inbox_ids(client, mentor)


async def test_cmp_security_admin_changes_a_mentor_gender(client):
    mentor = await person(client, "abu-abdullah", roles=("mentor",), gender="m", languages=("en",))
    admin = await person(client, "admin-one", roles=("admin",), gender="m")
    team = await person(client, "team-one", roles=("team",), gender="m")
    assert (await client.put(f"/api/admin/users/{mentor.id}/gender", json={"gender": "f"}, headers=team.h)).status_code == 403
    r = await client.put(f"/api/admin/users/{mentor.id}/gender", json={"gender": "f"}, headers=admin.h)
    assert r.status_code == 200 and r.json()["gender"] == "f"
    assert (await client.get("/api/me", headers=mentor.h)).json()["gender"] == "f"


async def test_cmp_security_learner_still_answers_the_match_form(client):
    layla = await person(client, "layla-1", gender="m")
    r = await client.put("/api/mentors/me/match", json={"gender": "f", "languages": ["en"]}, headers=layla.h)
    assert r.status_code == 200 and r.json()["gender"] == "f"


# --- Team members and mentors set their gender in «حسابي» --------------------


async def test_cmp_team_member_sets_gender_in_account_and_sees_same_gender_requests(client):
    team = await person(client, "team-one", roles=("team",), gender=None, languages=("en",))
    out = await ask_as_guest(client, body="hello", gender="f")
    assert out["request"]["id"] not in await inbox_ids(client, team)  # no gender yet: urgent requests only
    r = await client.patch("/api/me", json={"gender": "f"}, headers=team.h)
    assert r.status_code == 200 and r.json()["gender"] == "f"
    assert out["request"]["id"] in await inbox_ids(client, team)
    # once set, it changes only by an admin
    assert (await client.patch("/api/me", json={"gender": "m"}, headers=team.h)).status_code == 403
