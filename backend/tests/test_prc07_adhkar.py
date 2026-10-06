"""PRC-07 daily adhkar: one test per example (docs/domains/practice/features/PRC-07-daily-adhkar.md).

Since 2026-10-06 (rules.md §1.4) content is reviewed before it is merged, so
every offered dhikr is shown directly; a dhikr the reviewer returns is
withdrawn in that language until a corrected version exists."""

import json
import re

from app.core.config import get_settings
from app.practice import adhkar
from tests.conftest import with_roles, withdraw

AYAT_AL_KURSI = "hisn-75"  # morning and evening, chapter 27
FIRST_MORNING = "hisn-77"  # «أصبحنا وأصبح الملك لله…», no verse, repeat 1


def _raw(chapter: int, lang: str = "ar") -> dict[int, dict]:
    path = get_settings().hisnmuslim_dir / "raw" / lang / f"{chapter}.json"
    ((_, items),) = json.loads(path.read_text(encoding="utf-8-sig"), strict=False).items()
    return {int(x["ID"]): x for x in items}


async def _chapter(client, cid, lang):
    return (await client.get(f"/api/practice/adhkar/{cid}?lang={lang}")).json()


def _item(chapter, item_id):
    (it,) = [i for i in chapter["items"] if i["id"] == item_id]
    return it


def _offered(cid, lang):
    offered = {i.item_id for i in adhkar._review_items() if lang in i.views}
    return [iid for iid, _ in adhkar.chapter_items(cid) if iid in offered]


async def test_prc07_r1_merged_dhikr_shown_unchanged(client):
    r = await _chapter(client, 27, "ar")
    assert [i["id"] for i in r["items"]] == _offered(27, "ar") and FIRST_MORNING in _offered(27, "ar")  # no approval needed
    (seg,) = _item(r, FIRST_MORNING)["segments"]
    assert seg == {"t": "text", "text": _raw(27)[77]["ARABIC_TEXT"].strip()}  # byte-for-byte from the source
    assert "حصن المسلم" in r["source"]["name"]


async def test_prc07_r1_returned_dhikr_withdrawn_until_corrected(client, monkeypatch):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "dhikr", "hisn-102", "en", note="The meaning needs correcting")  # one sleep dhikr, English only
    assert "hisn-102" not in [i["id"] for i in (await _chapter(client, 28, "en"))["items"]]
    sleep = next(c for g in (await client.get("/api/practice/adhkar?lang=en")).json()["groups"] for c in g["chapters"] if c["id"] == 28)
    assert sleep["approved_count"] == sleep["total"] - 1
    assert "hisn-102" in [i["id"] for i in (await _chapter(client, 28, "ar"))["items"]]  # other languages unaffected
    # The corrected English meaning is merged: a new version, shown again.
    monkeypatch.setitem(adhkar.library().chapters[28].english[102], "TRANSLATED_TEXT", "(Corrected meaning.)")
    assert _item(await _chapter(client, 28, "en"), "hisn-102")["meaning"] == "(Corrected meaning.)"


async def test_prc07_r1_merged_chapter_shows_every_offered_dhikr(client):
    r = (await client.get("/api/practice/adhkar?lang=tl")).json()
    waking = next(c for g in r["groups"] for c in g["chapters"] if c["id"] == 1)
    assert waking["approved_count"] == waking["total"] > 0
    assert len((await _chapter(client, 1, "tl"))["items"]) == waking["total"]


async def test_prc07_r2_verses_are_references_not_text(client):
    item = _item(await _chapter(client, 27, "tl"), AYAT_AL_KURSI)
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
    item = _item(await _chapter(client, 27, "en"), FIRST_MORNING)
    en = _raw(27, "en")[77]
    assert item["meaning"] == en["TRANSLATED_TEXT"].strip()
    assert en["LANGUAGE_ARABIC_TRANSLATED_TEXT"].split()[0] not in json.dumps(item, ensure_ascii=False)  # «Asbahna…»


async def test_prc07_r3_english_verse_meaning_comes_from_quranenc_not_the_book(client):
    item = _item(await _chapter(client, 27, "en"), AYAT_AL_KURSI)
    assert item["meaning"] is None


async def test_prc07_r3_tagalog_has_no_machine_translation(client):
    item = _item(await _chapter(client, 27, "tl"), FIRST_MORNING)
    assert item["meaning"] is None and item["segments"][0]["text"].startswith("((أَصْبَحْنَا")


async def test_prc07_r4_repeat_is_data_and_nothing_is_recorded(client):
    item = _item(await _chapter(client, 27, "ar"), "hisn-76")  # the three Quls, three times
    assert item["repeat"] == 3
    from app.main import app

    practice = [p for p in app.openapi()["paths"] if p.startswith("/api/practice")]
    # whole words of the path, so "{country}" (the team's sighting entry) is not read as "count"
    words = {p: set(re.split(r"[^a-z]+", p.lower())) for p in practice}
    assert practice and not [p for p in practice if words[p] & {"count", "read", "log", "done"}]

    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.core.events import OutboxEvent

    async with SessionLocal() as s:
        names = [e.name for e in await s.scalars(select(OutboxEvent))]
    assert names == []  # reading adhkar records nothing


async def test_prc07_r5_audio_served_locally(client, tmp_path, monkeypatch):
    f = tmp_path / "77.mp3"
    f.write_bytes(b"ID3fake")
    monkeypatch.setattr(adhkar, "audio_path", lambda i: tmp_path / f"{i}.mp3")
    item = _item(await _chapter(client, 27, "ar"), FIRST_MORNING)
    assert item["audio"] is True
    r = await client.get("/api/practice/adhkar/audio/77.mp3")
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content == b"ID3fake"


async def test_prc07_r5_missing_audio_has_no_button(client, tmp_path, monkeypatch):
    monkeypatch.setattr(adhkar, "audio_path", lambda i: tmp_path / f"{i}.mp3")
    item = _item(await _chapter(client, 27, "ar"), FIRST_MORNING)
    assert item["audio"] is False
    assert (await client.get("/api/practice/adhkar/audio/77.mp3")).status_code == 404


async def test_prc07_r6_groups_follow_the_book_chapters(client):
    r = (await client.get("/api/practice/adhkar?lang=ar")).json()
    assert [g["key"] for g in r["groups"]] == ["morning_evening", "after_prayer", "sleep", "waking", "daily"]
    assert r["groups"][0]["chapters"][0]["title"] == "أذكار الصباح والمساء"
