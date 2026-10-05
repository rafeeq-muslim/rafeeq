"""PRC-07 daily adhkar: one test per example (docs/domains/practice/features/PRC-07-daily-adhkar.md)."""

import json

from app.core.config import get_settings
from app.practice import adhkar
from tests.conftest import auth, with_roles

AYAT_AL_KURSI = "hisn-75"  # morning and evening, chapter 27
FIRST_MORNING = "hisn-77"  # «أصبحنا وأصبح الملك لله…», no verse, repeat 1


def _raw(chapter: int, lang: str = "ar") -> dict[int, dict]:
    path = get_settings().hisnmuslim_dir / "raw" / lang / f"{chapter}.json"
    ((_, items),) = json.loads(path.read_text(encoding="utf-8-sig"), strict=False).items()
    return {int(x["ID"]): x for x in items}


async def _approve(client, token, item_id, lang):
    detail = (await client.get(f"/api/review/items/dhikr/{item_id}", headers=auth(token))).json()
    body = {"decision": "approved", "hash": detail["langs"][lang]["hash"]}
    r = await client.post(f"/api/review/items/dhikr/{item_id}/{lang}", json=body, headers=auth(token))
    assert r.status_code == 200, r.text


async def test_prc07_r1_approved_dhikr_shown_unchanged(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, FIRST_MORNING, "ar")
    r = (await client.get("/api/practice/adhkar/27?lang=ar")).json()
    assert [i["id"] for i in r["items"]] == [FIRST_MORNING]
    (seg,) = r["items"][0]["segments"]
    assert seg == {"t": "text", "text": _raw(27)[77]["ARABIC_TEXT"].strip()}  # byte-for-byte from the source
    assert "حصن المسلم" in r["source"]["name"]


async def test_prc07_r1_unapproved_dhikr_hidden(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, "hisn-102", "en")  # one sleep dhikr, English only
    r = (await client.get("/api/practice/adhkar/28?lang=en")).json()
    assert [i["id"] for i in r["items"]] == ["hisn-102"]
    assert (await client.get("/api/practice/adhkar/28?lang=ar")).json()["items"] == []


async def test_prc07_r1_chapter_without_approval_reports_zero(client):
    r = (await client.get("/api/practice/adhkar?lang=tl")).json()
    waking = next(c for g in r["groups"] for c in g["chapters"] if c["id"] == 1)
    assert waking["approved_count"] == 0 and waking["total"] > 0
    assert (await client.get("/api/practice/adhkar/1?lang=tl")).json()["items"] == []


async def test_prc07_r2_verses_are_references_not_text(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, AYAT_AL_KURSI, "tl")
    item = (await client.get("/api/practice/adhkar/27?lang=tl")).json()["items"][0]
    assert {"t": "quran", "sura": 2, "from": 255, "to": 255} in item["segments"]
    text = " ".join(s.get("text", "") for s in item["segments"])
    assert "﴿" not in text and "الْقَيُّومُ" not in text  # the verse words never come from the book
    assert item["segments"][0]["text"] == _raw(27)[75]["ARABIC_TEXT"].split("﴿")[0].strip()  # the words around it do


def test_prc07_r2_unmapped_verse_not_offered():
    assert adhkar.segments("قبل ﴿الم﴾ بعد", None) is None
    assert adhkar.segments("﴿أ﴾ و ﴿ب﴾", [[1, 1, 1]]) is None
    offered = {i.item_id for i in adhkar._review_items()}
    assert "hisn-110" not in offered  # names whole surahs: excluded in content/practice/adhkar.json
    assert {AYAT_AL_KURSI, "hisn-76", "hisn-101"} <= offered


async def test_prc07_r3_english_meaning_without_transliteration(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, FIRST_MORNING, "en")
    item = (await client.get("/api/practice/adhkar/27?lang=en")).json()["items"][0]
    en = _raw(27, "en")[77]
    assert item["meaning"] == en["TRANSLATED_TEXT"].strip()
    assert en["LANGUAGE_ARABIC_TRANSLATED_TEXT"].split()[0] not in json.dumps(item, ensure_ascii=False)  # «Asbahna…»


async def test_prc07_r3_english_verse_meaning_comes_from_quranenc_not_the_book(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, AYAT_AL_KURSI, "en")
    item = (await client.get("/api/practice/adhkar/27?lang=en")).json()["items"][0]
    assert item["meaning"] is None


async def test_prc07_r3_tagalog_has_no_machine_translation(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, FIRST_MORNING, "tl")
    item = (await client.get("/api/practice/adhkar/27?lang=tl")).json()["items"][0]
    assert item["meaning"] is None and item["segments"][0]["text"].startswith("((أَصْبَحْنَا")


async def test_prc07_r4_repeat_is_data_and_nothing_is_recorded(client):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, "hisn-76", "ar")  # the three Quls, three times
    item = (await client.get("/api/practice/adhkar/27?lang=ar")).json()["items"][0]
    assert item["repeat"] == 3
    from app.main import app

    practice = [p for p in app.openapi()["paths"] if p.startswith("/api/practice")]
    assert practice and not [p for p in practice if any(w in p for w in ("count", "read", "log", "done"))]

    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.core.events import OutboxEvent

    async with SessionLocal() as s:
        names = [e.name for e in await s.scalars(select(OutboxEvent))]
    assert [n for n in names if n != "AccountCreated"] == ["ContentApproved"]  # the reviewer's sign-up, then the approval


async def test_prc07_r5_audio_served_locally(client, tmp_path, monkeypatch):
    f = tmp_path / "77.mp3"
    f.write_bytes(b"ID3fake")
    monkeypatch.setattr(adhkar, "audio_path", lambda i: tmp_path / f"{i}.mp3")
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, FIRST_MORNING, "ar")
    item = (await client.get("/api/practice/adhkar/27?lang=ar")).json()["items"][0]
    assert item["audio"] is True
    r = await client.get("/api/practice/adhkar/audio/77.mp3")
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content == b"ID3fake"


async def test_prc07_r5_missing_audio_has_no_button(client, tmp_path, monkeypatch):
    monkeypatch.setattr(adhkar, "audio_path", lambda i: tmp_path / f"{i}.mp3")
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _approve(client, reviewer, FIRST_MORNING, "ar")
    item = (await client.get("/api/practice/adhkar/27?lang=ar")).json()["items"][0]
    assert item["audio"] is False
    assert (await client.get("/api/practice/adhkar/audio/77.mp3")).status_code == 404


async def test_prc07_r6_groups_follow_the_book_chapters(client):
    r = (await client.get("/api/practice/adhkar?lang=ar")).json()
    assert [g["key"] for g in r["groups"]] == ["morning_evening", "after_prayer", "sleep", "waking", "daily"]
    assert r["groups"][0]["chapters"][0]["title"] == "أذكار الصباح والمساء"
