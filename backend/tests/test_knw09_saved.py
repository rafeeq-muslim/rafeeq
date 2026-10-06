"""KNW-09 saved items: account copy (R3–R5)."""

from tests.conftest import auth, register, with_roles

T1 = "2026-10-01T08:00:00+00:00"
T2 = "2026-10-03T08:00:00+00:00"


def _items(*refs, at=T1):
    return {"items": [{"kind": "card", "ref": r, "saved_at": at} for r in refs]}


async def test_knw09_r3_guest_items_move_to_account(client):
    token = (await register(client))["access_token"]
    r = await client.put("/api/me/saved", json=_items("c1", "c2", "c3", "c4"), headers=auth(token))
    assert r.status_code == 200
    assert sorted(i["ref"] for i in (await client.get("/api/me/saved", headers=auth(token))).json()["items"]) == ["c1", "c2", "c3", "c4"]


async def test_knw09_r3_merge_keeps_one_copy(client):
    token = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_items("c1", at=T2), headers=auth(token))
    merged = (await client.put("/api/me/saved", json=_items("c1", at=T1), headers=auth(token))).json()["items"]
    assert len(merged) == 1 and merged[0]["saved_at"].startswith("2026-10-01")


async def test_knw09_r4_saved_items_are_only_the_owners(client):
    layla = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_items("c1"), headers=auth(layla))
    mentor = await with_roles(client, "mentor-1", "mentor")
    assert (await client.get("/api/me/saved", headers=auth(mentor))).json()["items"] == []
    assert (await client.get("/api/me/saved")).status_code == 401


async def test_knw09_r5_delete_one_and_all(client):
    token = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_items("c1", "c2"), headers=auth(token))
    assert (await client.delete("/api/me/saved/card/c1", headers=auth(token))).status_code == 204
    assert [i["ref"] for i in (await client.get("/api/me/saved", headers=auth(token))).json()["items"]] == ["c2"]
    assert (await client.delete("/api/me/saved", headers=auth(token))).status_code == 204
    assert (await client.get("/api/me/saved", headers=auth(token))).json()["items"] == []


async def test_knw09_r5_deleting_account_deletes_saved(client):
    from sqlalchemy import func, select

    from app.core.db import SessionLocal
    from app.knowledge.models import SavedItem

    token = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_items("c1", "c2"), headers=auth(token))
    r = await client.request("DELETE", "/api/me", headers=auth(token), json={"password": "pass-1234-word"})
    assert r.status_code == 204, r.text
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(SavedItem)) == 0


# --- saved answers (R2, R3, R5, R6) ---------------------------------------------

AYAH_AR = "quranenc:ar:1:2"
AYAH_EN = "quranenc:english_saheeh:1:2"
ANSWER = {"lang": "en", "answer": "Rafeeq's wording. {{q:quranenc:english_saheeh:1:2}}", "source_ids": [AYAH_EN]}


def _answer(ref="ask-1", at=T1, **over):
    return {"items": [{"kind": "answer", "ref": ref, "saved_at": at, "answer": {**ANSWER, **over}}]}


async def _payloads() -> list[dict]:
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.knowledge.models import SavedItem

    async with SessionLocal() as s:
        return [r.payload for r in await s.scalars(select(SavedItem))]


async def test_knw09_r2_saved_answer_keeps_text_sources_and_date_not_the_question(client):
    token = (await register(client))["access_token"]
    assert (await client.put("/api/me/saved", json=_answer(), headers=auth(token))).status_code == 200
    [item] = (await client.get("/api/me/saved", headers=auth(token))).json()["items"]
    assert item["answer"] == ANSWER and item["saved_at"].startswith("2026-10-01")
    assert all("question" not in p for p in await _payloads())
    # The question is never accepted (no consent rule yet), and only answers carry a payload.
    assert (await client.put("/api/me/saved", json=_answer("ask-2", question="Q?"), headers=auth(token))).status_code == 422
    card = {"items": [{"kind": "card", "ref": "c1", "saved_at": T1, "answer": ANSWER}]}
    assert (await client.put("/api/me/saved", json=card, headers=auth(token))).status_code == 422


async def test_knw09_r2_ayah_in_a_saved_answer_comes_from_the_stored_record(client):
    from tests.knw_fakes import add_passages

    await add_passages(
        {
            "id": AYAH_AR,
            "kind": "quran_arabic",
            "lang": "ar",
            "ref": {"sura": 1, "aya": 2},
            "ref_key": "1:2",
            "quote_text": "نص عربي للاختبار",
        },
        {
            "id": AYAH_EN,
            "kind": "quran_translation",
            "lang": "en",
            "ref": {"sura": 1, "aya": 2},
            "ref_key": "1:2",
            "quote_text": "stored test meaning",
            "meta": {"translation_key": "english_saheeh"},
        },
        embed=False,
    )
    r = await client.get("/api/scripture/passages", params={"ids": [AYAH_EN, "quranenc:en:9:999"]})
    assert r.status_code == 200
    [c] = r.json()["cards"]  # an id with no stored record is left out, never filled in
    assert c["id"] == AYAH_EN and c["quote_text"] == "stored test meaning" and c["arabic_text"] == "نص عربي للاختبار"
    assert (await client.get("/api/scripture/passages")).status_code == 422


async def test_knw09_r6_passages_of_a_source_no_longer_used_are_not_shown(client):
    from sqlalchemy import update

    from app.core.db import SessionLocal
    from app.knowledge import source_policy
    from app.knowledge.models import Source
    from tests.knw_fakes import add_passages

    await add_passages({"id": "hadeethenc:en:1", "lang": "en", "quote_text": "stored test hadith"}, embed=False)
    async with SessionLocal() as s:
        await s.execute(update(Source).where(Source.id == "hadeethenc").values(mode="link"))
        await s.commit()
    source_policy.reset_readiness_cache()
    assert (await client.get("/api/scripture/passages", params={"ids": ["hadeethenc:en:1"]})).json()["cards"] == []


async def test_knw09_r3_saved_answer_moves_to_the_account(client):
    token = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_answer(), headers=auth(token))
    # The same answer from a second device without its text keeps the account's copy (one entry).
    bare = {"items": [{"kind": "answer", "ref": "ask-1", "saved_at": T2}]}
    items = (await client.put("/api/me/saved", json=bare, headers=auth(token))).json()["items"]
    assert len(items) == 1 and items[0]["answer"]["answer"] == ANSWER["answer"]


async def test_knw09_r5_deleting_a_saved_answer_removes_its_text(client):
    token = (await register(client))["access_token"]
    await client.put("/api/me/saved", json=_answer("ask-1"), headers=auth(token))
    await client.put("/api/me/saved", json=_answer("ask-2"), headers=auth(token))
    assert (await client.delete("/api/me/saved/answer/ask-1", headers=auth(token))).status_code == 204
    assert len(await _payloads()) == 1
    assert (await client.delete("/api/me/saved", headers=auth(token))).status_code == 204
    assert await _payloads() == []
