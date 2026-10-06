"""KNW-05 content review and LRN-01 R6: one test per example.

Rule since 2026-10-06 (product owner, rules.md §1.4): content is reviewed
before it is merged, so merged content is shown directly; the desk confirms
versions or withdraws one by returning it with a reason."""

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


async def test_rules_1_4_merged_content_is_shown_without_in_app_approval(client, store):
    r = (await client.get("/api/content?lang=ar")).json()
    assert set(r["lessons"]) == {"u1-l1", "u1-l2"} and r["units"][0]["lessons"] == ["u1-l1", "u1-l2"]


async def test_knw05_r1_approval_is_recorded_and_emits_event(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    assert (await _approve(client, reviewer, "unit", "u1", "ar")).status_code == 200
    assert (await _approve(client, reviewer, "lesson", "u1-l1", "ar")).status_code == 200
    r = (await client.get("/api/content?lang=ar")).json()
    assert r["lessons"]["u1-l1"]["cards"][0]["text"] == "اغسل وجهك"

    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.core.events import OutboxEvent

    async with SessionLocal() as s:
        names = [e.name for e in await s.scalars(select(OutboxEvent))]
    assert names.count("ContentApproved") == 2


async def test_knw05_return_withdraws_that_version_until_corrected(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    assert (await _approve(client, reviewer, "lesson", "u1-l1", "ar", "returned", note="العبارة تحتاج تصحيحًا")).status_code == 200
    assert "u1-l1" not in (await client.get("/api/content?lang=ar")).json()["lessons"]
    assert "u1-l1" in (await client.get("/api/content?lang=en")).json()["lessons"]  # R6: per language
    store.lessons["u1-l1"] = _lesson("u1-l1", wudu_ar="اغسل وجهك ثلاثًا")  # the corrected version is merged
    r = (await client.get("/api/content?lang=ar")).json()
    assert r["lessons"]["u1-l1"]["cards"][0]["text"] == "اغسل وجهك ثلاثًا"
    history = (await client.get("/api/review/items/lesson/u1-l1", headers=auth(reviewer))).json()["history"]
    assert [h["decision"] for h in history] == ["returned"]


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


async def test_knw05_r6_each_language_is_reviewed_separately(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, "lesson", "u1-l1", "tl", "returned", note="Kailangang ayusin")
    assert "u1-l1" not in (await client.get("/api/content?lang=tl")).json()["lessons"]
    assert "u1-l1" in (await client.get("/api/content?lang=ar")).json()["lessons"]
    # u1-l2 has no Tagalog text at all: it is not offered for Tagalog review.
    detail = (await client.get("/api/review/items/lesson/u1-l2", headers=auth(reviewer))).json()
    assert set(detail["langs"]) == {"ar", "en"}


async def test_lrn01_preview_is_for_team_only(client, store):
    assert (await client.get("/api/content?lang=ar&preview=true")).status_code == 403
    team = await with_roles(client, "team-1", "team")
    r = (await client.get("/api/content?lang=ar&preview=true", headers=auth(team))).json()
    assert set(r["lessons"]) == {"u1-l1", "u1-l2"}
