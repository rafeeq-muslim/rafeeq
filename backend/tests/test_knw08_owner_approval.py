"""KNW-08 R4 / KNW-05: the product owner's blanket approval of 2026-10-06
(content/approvals/product-owner-2026-10-06.json) is recorded through the desk's
own tables at start, so the six Quranpedia reciters reach learners without
bypassing the gate, and a reviewer's decision always wins."""

import dataclasses

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.knowledge import jobs, owner_approvals, recitation, review
from app.knowledge.models import ContentApproval, ContentReview
from tests.conftest import auth, with_roles, withdraw

SIX = [f"quranpedia-{n}" for n in (248, 249, 251, 253, 254, 255)]
APPROVER = "product owner blanket approval 2026-10-06 (ناصر بن عبدالعزيز العويمر)"
LABEL = "مالك المنتج — اعتماد عام 2026-10-06"


async def _served(client, lang="ar"):
    return [x["id"] for x in (await client.get(f"/api/discover/recitations?lang={lang}")).json()["reciters"]]


async def _counts():
    async with SessionLocal() as s:
        return (
            await s.scalar(select(func.count()).select_from(ContentApproval)),
            await s.scalar(select(func.count()).select_from(ContentReview)),
            await s.scalar(select(func.count()).select_from(OutboxEvent)),
        )


def test_knw08_r4_listed_hashes_match_the_current_reciters():
    """An edit after the owner's approval is not silently covered: update the file
    (a new decision) or let the edited version go back to review."""
    [f] = owner_approvals.load_files()
    assert f["approver"] == APPROVER and f["label"] == LABEL and f["decided_on"] == "2026-10-06"
    assert "مهند" not in f["approver"]  # not the Sharia reviewer
    current = {it.item_id: it for it in review.items("recitation")}
    listed = owner_approvals.grants()
    assert sorted(g.item_id for g in listed) == SIX
    for g in listed:
        assert g.item_type == "recitation" and g.lang == "ar"
        assert current[g.item_id].gated
        assert g.content_hash == current[g.item_id].hash("ar"), f"{g.item_id} changed since the owner's approval"


async def test_knw08_r4_reciters_are_gated_before_and_served_after_the_owner_approval(client):
    assert await _served(client) == []
    out = await owner_approvals.run()
    assert out == {"recorded": 6, "already_decided": 0, "stale": 0}
    for lang in ("ar", "en", "tl"):
        assert await _served(client, lang) == SIX

    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    queue = (await client.get("/api/review/queue?item_type=recitation", headers=auth(reviewer))).json()
    rows = {i["item_id"]: i for i in queue["items"]}
    for i in SIX:
        assert rows[i]["langs"] == {"ar": {"status": "approved", "live": True, "note": None}}
    async with SessionLocal() as s:
        a = await s.scalar(select(ContentApproval).where(ContentApproval.item_id == "quranpedia-248"))
        assert a.reviewer_id is None and a.note == APPROVER and a.decided_at.date().isoformat() == "2026-10-06"
        assert a.snapshot == recitation.reciter_review_view(recitation.verse_reciters()[0])


async def test_knw08_r4_desk_history_names_the_product_owner_not_a_reviewer(client):
    await owner_approvals.run()
    team = await with_roles(client, "team-1", "team")
    [h] = (await client.get("/api/review/items/recitation/quranpedia-255", headers=auth(team))).json()["history"]
    assert h["decision"] == "approved" and h["lang"] == "ar"
    assert h["reviewer"] == LABEL and h["note"] == APPROVER
    assert h["at"].startswith("2026-10-06")


async def test_knw08_r4_running_twice_changes_nothing(client):
    await owner_approvals.run()
    before = await _counts()
    assert before == (6, 6, 6)
    assert await owner_approvals.run() == {"recorded": 0, "already_decided": 6, "stale": 0}
    assert await _counts() == before
    assert await _served(client) == SIX


async def test_knw08_r4_an_existing_reviewer_return_is_not_overridden(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "recitation", "quranpedia-249", "ar", note="في العيّنة مقطع غير واضح")
    out = await owner_approvals.run()
    assert out == {"recorded": 5, "already_decided": 1, "stale": 0}
    assert await _served(client) == [i for i in SIX if i != "quranpedia-249"]
    queue = (await client.get("/api/review/queue?item_type=recitation", headers=auth(reviewer))).json()
    row = next(i for i in queue["items"] if i["item_id"] == "quranpedia-249")
    assert row["langs"]["ar"] == {"status": "returned", "live": False, "note": "في العيّنة مقطع غير واضح"}


async def test_knw08_r4_an_existing_reviewer_approval_is_kept(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    detail = (await client.get("/api/review/items/recitation/quranpedia-251", headers=auth(reviewer))).json()
    body = {"decision": "approved", "hash": detail["langs"]["ar"]["hash"]}
    assert (await client.post("/api/review/items/recitation/quranpedia-251/ar", json=body, headers=auth(reviewer))).status_code == 200
    assert (await owner_approvals.run())["recorded"] == 5
    [h] = (await client.get("/api/review/items/recitation/quranpedia-251", headers=auth(reviewer))).json()["history"]
    assert h["reviewer"] == "نخلة الهادئ" and h["note"] is None  # the reviewer's own decision, untouched


async def test_knw08_r4_a_later_reviewer_return_wins(client):
    await owner_approvals.run()
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "recitation", "quranpedia-253", "ar")
    assert "quranpedia-253" not in await _served(client)
    await owner_approvals.run()  # the next start does not bring it back
    assert "quranpedia-253" not in await _served(client)


async def test_knw08_r4_an_edited_reciter_is_not_covered(client, monkeypatch):
    real = owner_approvals.grants()
    stale = [dataclasses.replace(g, content_hash="0" * 64) if g.item_id == "quranpedia-254" else g for g in real]
    monkeypatch.setattr(owner_approvals, "grants", lambda: stale)
    assert await owner_approvals.run() == {"recorded": 5, "already_decided": 0, "stale": 1}
    assert "quranpedia-254" not in await _served(client)


def test_knw08_r4_owner_approvals_run_once_at_start():
    added = []

    class Scheduler:
        def add_job(self, fn, trigger, **kw):
            added.append((fn, trigger, kw["id"]))

    jobs.register(Scheduler())
    assert (jobs.record_owner_approvals, "date", "knw_owner_approvals") in added
