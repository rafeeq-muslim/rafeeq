"""KNW-07 stories, benefits and the daily card: server side (one test per example).

Since 2026-10-06 (rules.md §1.4) cards are reviewed before they are merged, so
a merged card is served directly; a card the reviewer returns is withdrawn in
that language until corrected."""

import json

import pytest

from app.core.config import get_settings
from app.knowledge import daily
from tests.conftest import with_roles, withdraw


def _card(hid, langs=("ar", "en", "tl")):
    texts = {"ar": "«إنما الأعمال بالنيات»", "en": "Deeds are by intentions", "tl": "Ang mga gawa ay ayon sa layunin"}
    return {
        "id": f"hadeethenc-{hid}",
        "kind": "benefit",
        "hadith_id": hid,
        "source": {"name": "HadeethEnc.com", "url": f"https://hadeethenc.com/ar/browse/hadith/{hid}", "version": "api-v1@2026-10-05"},
        "langs": {
            lg: {
                "title": f"t-{lg}",
                "text": texts[lg],
                "benefits": [f"b-{lg}"],
                "explanation": f"e-{lg}",
                "grade": "صحيح",
                "attribution": "متفق عليه",
                "url": f"https://hadeethenc.com/{lg}/browse/hadith/{hid}",
            }
            for lg in langs
        },
    }


@pytest.fixture
def cards(monkeypatch):
    data = {"cards": [_card(1), _card(2), _card(3, langs=("ar", "en"))], "previous": None}
    monkeypatch.setattr(daily, "load", lambda: data)
    return data


def _ids(body):
    return [c["id"] for c in body["cards"]]


async def test_knw07_r1_merged_card_served_with_source(client, cards):
    r = await client.get("/api/discover/cards?lang=tl")
    assert r.status_code == 200 and r.headers["cache-control"].startswith("public")
    card, _ = r.json()["cards"]
    assert card["id"] == "hadeethenc-1"
    assert card["text"] == "Ang mga gawa ay ayon sa layunin"
    assert card["text_ar"] == "«إنما الأعمال بالنيات»"  # the original, separate from the explanation
    assert card["source"]["name"] == "HadeethEnc.com" and card["source"]["url"].endswith("/tl/browse/hadith/1")
    assert card["benefits"] == ["b-tl"] and card["explanation"] == "e-tl"
    assert r.json()["total"] == 3 and card["order"] == 0  # the device picks by date modulo the whole set


async def test_knw07_r1_returned_card_withdrawn_until_corrected(client, cards):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "daily_card", "hadeethenc-1", "ar", note="الشرح يحتاج تصحيحًا")
    ar = (await client.get("/api/discover/cards?lang=ar")).json()
    assert _ids(ar) == ["hadeethenc-2", "hadeethenc-3"]  # card 1 is withdrawn: never served; the device moves on to the next
    assert ar["total"] == 3 and ar["cards"][0]["order"] == 1
    assert _ids((await client.get("/api/discover/cards?lang=en")).json()) == ["hadeethenc-1", "hadeethenc-2", "hadeethenc-3"]
    cards["cards"][0]["langs"]["ar"]["explanation"] = "شرح مصحح"  # the corrected card is merged
    assert _ids((await client.get("/api/discover/cards?lang=ar")).json()) == ["hadeethenc-1", "hadeethenc-2", "hadeethenc-3"]


async def test_knw07_r6_language_without_text_gets_other_cards(client, cards):
    # Card 3 has no Tagalog text at all: nothing machine-translated, the other cards are served.
    assert _ids((await client.get("/api/discover/cards?lang=tl")).json()) == ["hadeethenc-1", "hadeethenc-2"]
    assert _ids((await client.get("/api/discover/cards?lang=en")).json()) == ["hadeethenc-1", "hadeethenc-2", "hadeethenc-3"]


def test_knw07_r1_card_text_matches_stored_record():
    """The shipped cards carry HadeethEnc's text unchanged (rules.md §1.3)."""
    corpus = get_settings().corpus_dir / "hadeethenc.jsonl"
    shipped = daily.cards_file()
    if not corpus.exists() or not shipped.exists():
        pytest.skip("corpus or cards file not present")
    data = json.loads(shipped.read_text(encoding="utf-8"))
    wanted = {t["passage_id"]: t["text"] for c in data["cards"] for t in c["langs"].values()}
    found = {}
    with corpus.open(encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            if r["id"] in wanted:
                found[r["id"]] = r["quote_text"]
    assert found == wanted
