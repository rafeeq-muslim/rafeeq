"""KNW-05 content review and LRN-01 R6: one test per example."""

import pytest

from app.learning import content
from tests.conftest import auth, register, with_roles


def _lesson(lid, wudu_ar="اغسل وجهك", with_tl=True):
    t = lambda ar, en, tl: {"ar": ar, "en": en, **({"tl": tl} if with_tl else {})}  # noqa: E731
    return {
        "id": lid,
        "unit": "u1",
        "order": 1,
        "title": t("الوضوء", "Wudu", "Wudu"),
        "cards": [{"id": f"{lid}-c1", "kind": "step", "text": t(wudu_ar, "Wash your face", "Hugasan ang mukha")}],
        "objectives": [],
        "exercises": [],
        "review_status": "in_review",
    }


@pytest.fixture
def store(monkeypatch):
    s = content.ContentStore(
        units=[
            {
                "id": "u1",
                "order": 1,
                "title": {"ar": "الطهارة", "en": "Purity", "tl": "Kalinisan"},
                "badge_name": {},
                "source_credit": {},
                "lessons": ["u1-l1", "u1-l2"],
            }
        ],
        lessons={"u1-l1": _lesson("u1-l1"), "u1-l2": _lesson("u1-l2", with_tl=False)},
    )
    monkeypatch.setattr(content, "store", lambda: s)
    return s


async def _approve(client, token, item_type, item_id, lang, decision="approved", note=None):
    detail = (await client.get(f"/api/review/items/{item_type}/{item_id}", headers=auth(token))).json()
    body = {"decision": decision, "hash": detail["langs"][lang]["hash"], "note": note}
    return await client.post(f"/api/review/items/{item_type}/{item_id}/{lang}", json=body, headers=auth(token))


async def test_knw05_r1_unreviewed_card_is_hidden(client, store):
    r = (await client.get("/api/content?lang=ar")).json()
    assert r["lessons"] == {} and r["units"] == []


async def test_knw05_r1_approval_makes_it_visible_and_emits_event(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    assert (await _approve(client, reviewer, "unit", "u1", "ar")).status_code == 200
    assert (await _approve(client, reviewer, "lesson", "u1-l1", "ar")).status_code == 200
    r = (await client.get("/api/content?lang=ar")).json()
    assert list(r["lessons"]) == ["u1-l1"] and r["lessons"]["u1-l1"]["cards"][0]["text"] == "اغسل وجهك"
    assert r["units"][0]["lessons"] == ["u1-l1"]

    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.core.events import OutboxEvent

    async with SessionLocal() as s:
        names = [e.name for e in await s.scalars(select(OutboxEvent))]
    assert names.count("ContentApproved") == 2


async def test_knw05_r3_edit_keeps_old_approved_text_until_reapproved(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, "unit", "u1", "ar")
    await _approve(client, reviewer, "lesson", "u1-l1", "ar")
    store.lessons["u1-l1"] = _lesson("u1-l1", wudu_ar="اغسل وجهك ثلاثًا")

    learner = (await client.get("/api/content?lang=ar")).json()
    assert learner["lessons"]["u1-l1"]["cards"][0]["text"] == "اغسل وجهك"
    queue = (await client.get("/api/review/queue", headers=auth(reviewer))).json()
    row = next(i for i in queue["items"] if i["item_id"] == "u1-l1")
    assert row["langs"]["ar"] == {"status": "in_review", "live": True, "note": None}

    await _approve(client, reviewer, "lesson", "u1-l1", "ar")
    learner = (await client.get("/api/content?lang=ar")).json()
    assert learner["lessons"]["u1-l1"]["cards"][0]["text"] == "اغسل وجهك ثلاثًا"
    history = (await client.get("/api/review/items/lesson/u1-l1", headers=auth(reviewer))).json()["history"]
    assert [h["decision"] for h in history] == ["approved", "approved"] and history[0]["hash"] != history[1]["hash"]


async def test_knw05_r3_decision_on_a_version_the_reviewer_did_not_read_is_refused(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    detail = (await client.get("/api/review/items/lesson/u1-l1", headers=auth(reviewer))).json()
    store.lessons["u1-l1"] = _lesson("u1-l1", wudu_ar="نص آخر")
    r = await client.post(
        "/api/review/items/lesson/u1-l1/ar", json={"decision": "approved", "hash": detail["langs"]["ar"]["hash"]}, headers=auth(reviewer)
    )
    assert r.status_code == 409 and r.json()["detail"]["code"] == "changed_since_opened"


async def test_knw05_r4_return_needs_a_written_reason_the_writer_sees(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    assert (await _approve(client, reviewer, "lesson", "u1-l1", "ar", "returned", note="  ")).status_code == 422
    assert (await _approve(client, reviewer, "lesson", "u1-l1", "ar", "returned", note="المصدر لا يسند الجملة")).status_code == 200
    writer = await with_roles(client, "writer-1", "team")
    queue = (await client.get("/api/review/queue", headers=auth(writer))).json()
    row = next(i for i in queue["items"] if i["item_id"] == "u1-l1")
    assert row["langs"]["ar"]["status"] == "returned" and row["langs"]["ar"]["note"] == "المصدر لا يسند الجملة"


async def test_knw05_r5_only_the_sharia_reviewer_approves(client, store):
    for name, roles in (("team-1", ("team",)), ("admin-1", ("admin",))):
        token = await with_roles(client, name, *roles)
        assert (await _approve(client, token, "lesson", "u1-l1", "ar")).status_code == 403
    learner = (await register(client, username="learner-1"))["access_token"]
    assert (await client.get("/api/review/queue", headers=auth(learner))).status_code == 403
    assert (await client.get("/api/content?lang=ar")).json()["lessons"] == {}


async def test_knw05_r6_each_language_is_approved_separately(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    for lang in ("ar",):
        await _approve(client, reviewer, "unit", "u1", lang)
        await _approve(client, reviewer, "lesson", "u1-l1", lang)
    assert (await client.get("/api/content?lang=tl")).json()["lessons"] == {}
    assert list((await client.get("/api/content?lang=ar")).json()["lessons"]) == ["u1-l1"]
    # u1-l2 has no Tagalog text at all: it is not offered for Tagalog review.
    detail = (await client.get("/api/review/items/lesson/u1-l2", headers=auth(reviewer))).json()
    assert set(detail["langs"]) == {"ar", "en"}


async def test_lrn01_preview_is_for_team_only(client, store):
    assert (await client.get("/api/content?lang=ar&preview=true")).status_code == 403
    team = await with_roles(client, "team-1", "team")
    r = (await client.get("/api/content?lang=ar&preview=true", headers=auth(team))).json()
    assert set(r["lessons"]) == {"u1-l1", "u1-l2"} and r["lessons"]["u1-l1"]["approved"] is False
