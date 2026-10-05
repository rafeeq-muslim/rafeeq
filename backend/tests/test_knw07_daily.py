"""KNW-07 stories, benefits and the daily card: server side (one test per example)."""

import json

import pytest

from app.core.config import get_settings
from app.knowledge import daily
from tests.conftest import auth, with_roles


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


async def approve(client, token, item_type, item_id, lang):
    detail = (await client.get(f"/api/review/items/{item_type}/{item_id}", headers=auth(token))).json()
    body = {"decision": "approved", "hash": detail["langs"][lang]["hash"]}
    r = await client.post(f"/api/review/items/{item_type}/{item_id}/{lang}", json=body, headers=auth(token))
    assert r.status_code == 200, r.text


async def test_knw07_r1_approved_card_served_with_source(client, cards):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await approve(client, reviewer, "daily_card", "hadeethenc-1", "tl")
    r = await client.get("/api/discover/cards?lang=tl")
    assert r.status_code == 200 and r.headers["cache-control"].startswith("public")
    [card] = r.json()["cards"]
    assert card["text"] == "Ang mga gawa ay ayon sa layunin"
    assert card["text_ar"] == "«إنما الأعمال بالنيات»"  # the original, separate from the explanation
    assert card["source"]["name"] == "HadeethEnc.com" and card["source"]["url"].endswith("/tl/browse/hadith/1")
    assert card["benefits"] == ["b-tl"] and card["explanation"] == "e-tl"
    assert r.json()["total"] == 3 and card["order"] == 0  # the device picks by date modulo the whole set


async def test_knw07_r1_unapproved_card_is_not_served(client, cards):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await approve(client, reviewer, "daily_card", "hadeethenc-2", "ar")
    ids = [c["id"] for c in (await client.get("/api/discover/cards?lang=ar")).json()["cards"]]
    assert ids == ["hadeethenc-2"]  # card 1 is not approved: never served; the device moves on to the next


async def test_knw07_r6_language_without_approval_gets_other_cards(client, cards):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    for cid in ("hadeethenc-1", "hadeethenc-3"):
        await approve(client, reviewer, "daily_card", cid, "en")
    # Card 3 has no Tagalog text at all, and card 1 is not approved in Tagalog: nothing machine-translated.
    assert (await client.get("/api/discover/cards?lang=tl")).json()["cards"] == []
    assert [c["id"] for c in (await client.get("/api/discover/cards?lang=en")).json()["cards"]] == ["hadeethenc-1", "hadeethenc-3"]


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
