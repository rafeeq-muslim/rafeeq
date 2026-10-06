"""LRN-01 R4 / LRN-09 R2 (PR #33): Arabic recitation under whole-verse cards.

content/quran_recitation.json lists each verse, its cards and the Sharia
reviewer's status. GET /api/content marks `quran.recite` only on a card that
shows one whole verse whose file is approved; a pending verse sends nothing
playable, and a card showing part of a verse never recites."""

import json
import re

import pytest

from app.core.config import ROOT, get_settings
from app.learning import content, recitation

RECITATION = json.loads((get_settings().content_dir / "quran_recitation.json").read_text(encoding="utf-8"))
EXCERPTS = json.loads((get_settings().content_dir / "quran_excerpts.json").read_text(encoding="utf-8"))["cards"]


def _cards() -> dict[str, dict]:
    content.store.cache_clear()
    return {c["id"]: c for lesson in content.store().lessons.values() for c in lesson["cards"]}


def _served(body: dict) -> dict[str, dict]:
    return {c["id"]: c for lesson in body["lessons"].values() for c in lesson["cards"]}


@pytest.fixture
def approve(monkeypatch):
    """Only these verse refs approved, every other one pending (a fixture: the
    live file's statuses change as the reviewer listens)."""

    def _approve(*refs: str) -> None:
        verses = [{**v, "status": "approved" if v["ref"] in refs else "pending"} for v in RECITATION["verses"]]
        data = {**RECITATION, "verses": verses}
        monkeypatch.setattr(recitation, "_load", lambda: data)
        recitation.approved.cache_clear()

    yield _approve
    recitation.approved.cache_clear()


def test_every_listed_card_shows_that_whole_verse_and_is_not_an_excerpt():
    cards = _cards()
    assert RECITATION["url_pattern"] == "https://files.quranpedia.net/recitations/255/{sura:03d}{aya:03d}.mp3"
    for v in RECITATION["verses"]:
        assert v["status"] in ("pending", "approved")
        sura, aya = (int(x) for x in v["ref"].split(":"))
        for cid in v["cards"]:
            q = cards[cid]["quran"]
            assert (q["sura"], q["ayat"]) == (sura, [aya, aya]), cid
            assert "excerpt" not in q and cid not in EXCERPTS, cid


def test_the_live_file_is_read_with_its_statuses():
    recitation.approved.cache_clear()
    expected = {
        cid: tuple(int(x) for x in v["ref"].split(":")) for v in RECITATION["verses"] if v["status"] == "approved" for cid in v["cards"]
    }
    assert recitation.approved() == expected


async def test_lrn01_r4_pending_verses_send_nothing_playable(client, approve):
    approve()  # nobody has listened yet
    assert recitation.approved() == {}
    for lang in ("ar", "en", "tl"):
        r = await client.get(f"/api/content?lang={lang}")
        assert "quranpedia" not in r.text
        assert not any("recite" in (c.get("quran") or {}) for c in _served(r.json()).values())


async def test_lrn09_r2_an_approved_whole_verse_recites_in_every_language(client, approve):
    # Joseph in «نبيي محمد ﷺ»: Al-Anbiya 107, a whole verse whose file the reviewer approved.
    approve("21:107", "9:128")
    for lang in ("ar", "en", "tl"):
        served = _served((await client.get(f"/api/content?lang={lang}")).json())
        assert served["u2-l3-c2"]["quran"] == {"sura": 21, "ayat": [107, 107], "recite": True}
        assert served["u01-l1-c3"]["quran"]["recite"] is True  # the team unit's card too
        # still pending: no mark
        assert "recite" not in served["u2-l4-c1"]["quran"]
        # no URL is ever sent; the app builds it from the file pattern
        assert "quranpedia" not in json.dumps(served)


async def test_lrn09_r2_a_card_showing_part_of_a_verse_never_recites(client, monkeypatch):
    # «الصلاة والزكاة» quotes only «وَأَقِيمُوا الصَّلَاةَ»: even if its verse were listed and approved, no audio.
    cards = _cards()
    partial = {cid: (cards[cid]["quran"]["sura"], cards[cid]["quran"]["ayat"][0]) for cid in EXCERPTS if cid in cards}
    assert partial  # unit 1 and units 2–6 both have such cards
    monkeypatch.setattr(recitation, "approved", lambda: partial)
    for lang in ("ar", "en", "tl"):
        served = _served((await client.get(f"/api/content?lang={lang}")).json())
        shown = [cid for cid in partial if cid in served]
        assert "u3-l3-c4" in shown and "u01-l2-c1" in shown
        for cid in shown:
            assert "recite" not in served[cid]["quran"], (cid, lang)


async def test_the_review_view_is_unchanged_by_an_approved_recitation(client, approve):
    # The file is approved in the JSON, not through the lesson's hash: the desk keeps its decisions.
    from app.knowledge import review

    before = review.find("lesson", "u2-l3").hash("ar")
    approve("21:107")
    await client.get("/api/content?lang=ar")
    assert review.find("lesson", "u2-l3").hash("ar") == before


def test_csp_allows_the_recitation_host_for_media_only():
    csp = re.search(r'Content-Security-Policy "([^"]*)"', (ROOT / "infra" / "web.security-headers.inc").read_text()).group(1)
    directives = {d.split()[0]: d.split()[1:] for d in (p.strip() for p in csp.split(";")) if d}
    assert "https://files.quranpedia.net" in directives["media-src"]
    assert directives["connect-src"] == ["'self'"]
    assert "https://files.quranpedia.net" not in directives["img-src"]
