"""KNW-02 approved-sources ingestion: one test per example of R1, R2, R3, R5
and R6 (docs/domains/knowledge/features/KNW-02-approved-sources-ingestion.md).
R4 is in test_knw02_search.py. Texts are dummies (plan rule 6): never real
scripture."""

import json

import pytest
from sqlalchemy import func, select

from app.core.config import Settings, get_settings
from app.core.db import SessionLocal
from app.core.events import OutboxEvent
from app.knowledge import cards, embed, jobs, load, search, source_policy
from app.knowledge.models import Passage, Source
from app.knowledge.sources._common import make_passage, write_jsonl
from app.learning import content
from tests.conftest import with_roles, withdraw
from tests.knw_fakes import add_passages

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture


def _verse(sura: int, aya: int, version: str = "1.1.4", text: str | None = None) -> dict:
    return make_passage(
        id=f"quranenc:tagalog_rwwad:{sura}:{aya}",
        source_id="quranenc",
        kind="quran_translation",
        lang="tl",
        ref={"sura": sura, "aya": aya},
        ref_key=f"{sura}:{aya}",
        quote_text=text or f"TEST_TRANSLATION {sura}:{aya} v{version}",
        context_text=f"TEST_FOOTNOTE {sura}:{aya}",
        meta={"translation_key": "tagalog_rwwad"},
        version=version,
        origin_url=f"https://quranenc.com/tl/browse/tagalog_rwwad/{sura}/{aya}",
        fetched_at="2026-10-05T12:00:00Z",
    )


def _hadith(hid: int, lang: str = "en") -> dict:
    return make_passage(
        id=f"hadeethenc:{lang}:{hid}",
        source_id="hadeethenc",
        kind="hadith",
        lang=lang,
        ref={"hadith_id": hid},
        ref_key=str(hid),
        quote_text=f"TEST_HADITH_TEXT {hid}",
        context_text=f"TEST_EXPLANATION {hid}",
        meta={"grade": "TEST_GRADE", "attribution": "TEST_ATTRIBUTION", "reference": "TEST_REFERENCE", "hints": ["TEST_BENEFIT"]},
        version="api-v1@2026-10-05",
        origin_url=f"https://hadeethenc.com/{lang}/browse/hadith/{hid}",
        fetched_at="2026-10-05T12:00:00Z",
    )


def _write(path, rows: list[dict], extra: str = "") -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows) + extra, encoding="utf-8")


async def _rows(source_id: str) -> list[Passage]:
    async with SessionLocal() as s:
        return list(await s.scalars(select(Passage).where(Passage.source_id == source_id).order_by(Passage.id)))


@pytest.fixture
def corpus(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "corpus_dir", tmp_path)
    return tmp_path


# --- R1: only "index" sources are stored ---------------------------------------


async def test_knw02_r1_index_source_tagalog_translation_is_stored_and_indexed(corpus):
    _write(corpus / "quranenc.jsonl", [_verse(1, 1), _verse(1, 2)])
    assert await load.main(["quranenc"]) == 0
    rows = await _rows("quranenc")
    assert [r.ref_key for r in rows] == ["1:1", "1:2"] and all(r.lang == "tl" for r in rows)
    async with SessionLocal() as s:
        # in the text index straight away (the vectors follow with the embedding job)
        assert await s.scalar(select(func.count()).where(Passage.source_id == "quranenc", Passage.tsv.is_not(None))) == 2


async def test_knw02_r1_source_outside_the_list_stops_with_its_name_and_stores_nothing(corpus):
    _write(corpus / "madeup.jsonl", [{**_verse(1, 1), "id": "madeup:1", "source_id": "madeup"}])
    assert await load.main(["madeup"]) == 1
    with pytest.raises(SystemExit, match="madeup"):
        await load.load_source("madeup", corpus / "madeup.jsonl")
    async with SessionLocal() as s:
        assert await s.get(Source, "madeup") is None
        assert await s.scalar(select(func.count(Passage.id))) == 0


async def test_knw02_r1_link_only_text_is_never_loaded(corpus):
    # A source with mode "link" is not in the loader's list (docs/agents/sources.md):
    # its file is skipped by a full load and refused by name.
    assert "islamweb" not in load.SOURCES
    _write(corpus / "islamweb.jsonl", [{**_verse(1, 1), "id": "islamweb:1", "source_id": "islamweb"}])
    await load.main([])
    async with SessionLocal() as s:
        assert await s.get(Source, "islamweb") is None


# --- R2: text kept exactly, with source, id, language, version and origin ----------


async def test_knw02_r2_verse_translation_and_footnotes_match_the_source_with_reference_and_version(corpus):
    verse = _verse(2, 255, text="TEST «exact» text\nwith  two spaces")
    _write(corpus / "quranenc.jsonl", [verse])
    await load.main(["quranenc"])
    (row,) = await _rows("quranenc")
    assert row.quote_text == verse["quote_text"] and row.context_text == verse["context_text"]
    assert (row.ref, row.version, row.lang, row.origin_url) == ({"sura": 2, "aya": 255}, "1.1.4", "tl", verse["origin_url"])


async def test_knw02_r2_hadith_text_explanation_grade_and_reference_each_in_its_field(corpus):
    _write(corpus / "hadeethenc.jsonl", [_hadith(1234)])
    await load.main(["hadeethenc"])
    (row,) = await _rows("hadeethenc")
    assert row.quote_text == "TEST_HADITH_TEXT 1234" and row.context_text == "TEST_EXPLANATION 1234"
    assert (row.meta["grade"], row.meta["attribution"], row.meta["reference"]) == ("TEST_GRADE", "TEST_ATTRIBUTION", "TEST_REFERENCE")


def test_knw02_r2_sources_log_names_every_loaded_source_with_its_licence():
    log = (get_settings().content_dir.parent / "docs" / "agents" / "sources.md").read_text(encoding="utf-8").lower()
    for sid, meta in load.SOURCES.items():
        if sid in load.APP_SOURCES:
            continue  # the team's own approved cards, not an external source
        host = meta["url"].split("//")[1].lower()
        assert host in log, f"{sid} ({host}) missing from docs/agents/sources.md"
        assert meta["license"]


async def test_knw02_r2_record_without_id_or_version_is_not_stored_and_is_reported(tmp_path, corpus):
    good = _verse(1, 1)
    counts = write_jsonl("quranenc", [good, {**_verse(1, 2), "id": ""}, {**_verse(1, 3), "version": ""}], out=corpus / "quranenc.jsonl")
    assert counts["rejected"] == 2  # the normalizer's report
    await load.main(["quranenc"])
    assert [r.id for r in await _rows("quranenc")] == [good["id"]]


# --- R3: scripture shown from the stored record by its id --------------------------


async def test_knw02_r3_verse_by_id_is_the_stored_text_unchanged(client, ai):
    await add_passages(
        {"id": "quranenc:ar:2:255", "kind": "quran_arabic", "lang": "ar", "ref_key": "2:255", "quote_text": "TEST_ARABIC  2:255 ﴿"},
        {
            "id": "quranenc:english_saheeh:2:255",
            "kind": "quran_translation",
            "lang": "en",
            "ref_key": "2:255",
            "quote_text": "TEST_EN 2:255",
            "meta": {"translation_key": "english_saheeh"},
        },
    )
    r = (await client.get("/api/scripture/quran?sura=2&from=255&lang=en")).json()
    assert r["ayat"] == [
        {"aya": 255, "arabic": "TEST_ARABIC  2:255 ﴿", "translation": "TEST_EN 2:255", "url": "https://example.test/quranenc:ar:2:255"}
    ]


async def test_knw02_r3_hadith_by_id_is_the_stored_text_with_grade_and_reference(client, ai):
    await add_passages(
        {
            "id": "hadeethenc:en:1234",
            "lang": "en",
            "quote_text": "TEST_HADITH_TEXT 1234",
            "meta": {"grade": "TEST_GRADE", "attribution": "TEST_ATTRIBUTION", "reference": "TEST_REFERENCE", "hadeeth_ar": "TEST_AR"},
        }
    )
    r = await client.get("/api/scripture/hadith/1234?lang=en")
    assert r.status_code == 200
    assert r.json() == {
        "id": 1234,
        "lang": "en",
        "text": "TEST_HADITH_TEXT 1234",
        "arabic": "TEST_AR",
        "grade": "TEST_GRADE",
        "attribution": "TEST_ATTRIBUTION",
        "reference": "TEST_REFERENCE",
        "url": "https://example.test/hadeethenc:en:1234",
        "source": {"name": "HadeethEnc.com", "version": "test-1"},
    }


async def test_knw02_r3_unknown_verse_or_hadith_id_is_not_found_with_no_other_text(client, ai):
    await add_passages({"id": "hadeethenc:en:1234", "lang": "en", "quote_text": "TEST_HADITH_TEXT 1234"})
    for url in ("/api/scripture/hadith/999", "/api/scripture/hadith/1234?lang=tl", "/api/scripture/quran?sura=2&from=255"):
        r = await client.get(url)
        assert (r.status_code, r.json()) == (404, {"detail": "not_loaded"}), url


# --- R5: a reload moves to the newest version whole, or changes nothing ------------


async def test_knw02_r5_newer_version_replaces_the_old_one_whole_and_shows_its_number(corpus, client):
    _write(corpus / "quranenc.jsonl", [_verse(1, a, "1.1.3") for a in (1, 2, 3)])
    await load.main(["quranenc"])
    _write(corpus / "quranenc.jsonl", [_verse(1, a, "1.1.4") for a in (1, 2, 3)])
    await load.main(["quranenc"])
    rows = await _rows("quranenc")
    assert {r.version for r in rows} == {"1.1.4"} and all("v1.1.4" in r.quote_text for r in rows)
    async with SessionLocal() as s:
        assert (await s.get(Source, "quranenc")).versions["versions"] == {"1.1.4": 3}


async def test_knw02_r5_interrupted_reload_keeps_the_previous_version_whole(corpus):
    _write(corpus / "quranenc.jsonl", [_verse(1, a, "1.1.3") for a in (1, 2, 3)])
    await load.main(["quranenc"])
    # the source dropped mid-download: two new rows, then a cut line
    _write(corpus / "quranenc.jsonl", [_verse(1, a, "1.1.4") for a in (1, 2)], extra='{"id": "quranenc:tagalog_rwwad:1:3", "sou')
    assert await load.main(["quranenc"]) == 1
    rows = await _rows("quranenc")
    assert len(rows) == 3 and {r.version for r in rows} == {"1.1.3"}  # never two versions mixed


# --- R6: team cards enter the index only once approved ------------------------------


def _lesson(lid: str, text_ar: str) -> dict:
    return {
        "id": lid,
        "unit": "u1",
        "order": 1,
        "title": {"ar": "الوضوء", "en": "Wudu"},
        "cards": [
            {"id": f"{lid}-c1", "kind": "step", "text": {"ar": text_ar, "en": "TEST wash the face"}},
            {"id": f"{lid}-c2", "kind": "text", "text": {"ar": "", "en": ""}, "quran": {"sura": 5, "ayat": [6, 6]}},
        ],
        "objectives": [],
        "exercises": [],
    }


@pytest.fixture
def store(monkeypatch):
    s = content.ContentStore(
        units=[{"id": "u1", "order": 1, "title": {"ar": "الطهارة", "en": "Purity"}, "lessons": ["u1-l1"]}],
        lessons={"u1-l1": _lesson("u1-l1", "TEST اغسل وجهك")},
    )
    monkeypatch.setattr(content, "store", lambda: s)
    return s


async def test_knw02_r6_approved_card_enters_the_index_with_its_source_and_learning_is_told(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    detail = (await client.get("/api/review/items/lesson/u1-l1", headers={"Authorization": f"Bearer {reviewer}"})).json()
    r = await client.post(
        "/api/review/items/lesson/u1-l1/ar",
        json={"decision": "approved", "hash": detail["langs"]["ar"]["hash"]},
        headers={"Authorization": f"Bearer {reviewer}"},
    )
    assert r.status_code == 200
    rows = {p.id: p for p in await _rows(cards.SOURCE_ID)}
    # merged and approved cards with text, per language; the verse-only card is indexed from QuranEnc instead
    assert set(rows) == {"rafeeq_cards:ar:u1-l1-c1", "rafeeq_cards:en:u1-l1-c1"}
    card = rows["rafeeq_cards:ar:u1-l1-c1"]
    assert (card.kind, card.quote_text, card.origin_url) == ("approved_card", "TEST اغسل وجهك", "/app/learn/lesson/u1-l1")
    async with SessionLocal() as s:
        src = await s.get(Source, cards.SOURCE_ID)
        events = list(await s.scalars(select(OutboxEvent).where(OutboxEvent.name == "ContentApproved")))
    assert src.mode == "index" and src.name == load.SOURCES[cards.SOURCE_ID]["name"]
    assert [e.payload["item_id"] for e in events] == ["u1-l1"]  # the event the Learning domain reads


async def test_knw02_r6_card_not_approved_is_not_in_the_index(client, store):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await cards.refresh()
    assert len(await _rows(cards.SOURCE_ID)) == 2  # merged content is approved (rules.md §1.4)
    await withdraw(client, reviewer, "lesson", "u1-l1", "ar")
    assert [p.id for p in await _rows(cards.SOURCE_ID)] == ["rafeeq_cards:en:u1-l1-c1"]
    # an edited (corrected) version is indexed again on the next refresh, replacing the old text
    store.lessons["u1-l1"] = _lesson("u1-l1", "TEST اغسل وجهك ثلاثًا")
    await cards.refresh()
    ar = {p.id: p for p in await _rows(cards.SOURCE_ID)}["rafeeq_cards:ar:u1-l1-c1"]
    assert ar.quote_text == "TEST اغسل وجهك ثلاثًا" and ar.embedding is None


async def test_knw02_r6_cards_are_never_loaded_from_a_file_and_a_full_load_refreshes_them(corpus, store):
    _write(corpus / "rafeeq_cards.jsonl", [{**_verse(1, 1), "id": "rafeeq_cards:ar:x", "source_id": "rafeeq_cards"}])
    with pytest.raises(load.LoadRefused):
        await load.load_source("rafeeq_cards", corpus / "rafeeq_cards.jsonl")
    assert await load.main([]) == 0
    assert {p.id for p in await _rows(cards.SOURCE_ID)} == {"rafeeq_cards:ar:u1-l1-c1", "rafeeq_cards:en:u1-l1-c1"}


def test_knw02_r6_ex1_approved_cards_are_a_default_answer_source(monkeypatch):
    monkeypatch.delenv("KNW_ANSWER_SOURCES", raising=False)
    assert cards.SOURCE_ID in source_policy.parse_sources(Settings(_env_file=None).knw_answer_sources)[0]


async def test_knw02_r6_ex1_embedding_job_embeds_approved_cards_and_skips_returned_ones(client, store, ai):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await cards.refresh()
    await withdraw(client, reviewer, "lesson", "u1-l1", "ar")  # returned by the reviewer: leaves the index
    await jobs.embed_batch()  # the scheduled job, with the default answer sources
    rows = {p.id: p for p in await _rows(cards.SOURCE_ID)}
    assert set(rows) == {"rafeeq_cards:en:u1-l1-c1"}
    assert rows["rafeeq_cards:en:u1-l1-c1"].embedding is not None


async def test_knw02_r6_ex1_a_question_matching_an_approved_card_retrieves_it(store, ai):
    await cards.refresh()
    await embed.run(sources=[cards.SOURCE_ID])
    source_policy.reset_readiness_cache()
    async with SessionLocal() as s:
        res = await search.retrieve(s, "TEST wash the face", "en")
    card = next(p for p in res.passages if p.get("source_id") == cards.SOURCE_ID)
    assert (card["kind"], card["origin_url"]) == ("approved_card", "/app/learn/lesson/u1-l1")


# --- SC3: the embedding job shares its batches across sources and languages ----------


async def test_knw02_sc3_embedding_turns_go_round_every_source_and_language(ai):
    # islamqa Arabic sorts before islamqa English by id: before the fix English
    # waited until every Arabic row had a vector.
    rows = [
        *({"id": f"islamqa:ar:{i:03}", "kind": "fatwa", "lang": "ar", "quote_text": f"TEST_AR {i}"} for i in range(6)),
        *({"id": f"islamqa:en:{i:03}", "kind": "fatwa", "lang": "en", "quote_text": f"TEST_EN {i}"} for i in range(6)),
    ]
    await add_passages(*rows, embed=False)
    assert await embed.run(sources=["islamqa"], limit=4, batch=2) == {"embedded": 4, "stopped": None}
    async with SessionLocal() as s:
        done = dict(
            (lang, n)
            for lang, n in await s.execute(select(Passage.lang, func.count()).where(Passage.embedding.is_not(None)).group_by(Passage.lang))
        )
    assert done == {"ar": 2, "en": 2}
    # and a run still finishes everything when it may
    assert (await embed.run(sources=["islamqa"], batch=5))["embedded"] == 8  # fake provider (tests/knw_fakes)
