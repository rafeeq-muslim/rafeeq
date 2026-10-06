"""KNW-08 R4 (decision 2026-10-06): six Quranpedia per-verse Hafs reciters,
each offered to learners only after the Sharia reviewer approves it on a sample
of surahs in the review desk; al-Muaiqly stays until then."""

import copy

import pytest

from app.knowledge import recitation
from tests.conftest import auth, with_roles, withdraw

SIX = [248, 249, 251, 253, 254, 255]


@pytest.fixture
def muaiqly(monkeypatch):
    data = [
        {
            "id": "islamhouse-728787",
            "islamhouse_id": 728787,
            "reciter": recitation.RECITER,
            "edition": recitation.EDITION,
            "origin_url": "https://islamhouse.com/ar/quran/728787/",
            "suras": {"112": "https://d1.islamhouse.com/data/ar/ih_quran/x/ar-112-x.mp3"},
        }
    ]
    monkeypatch.setattr(recitation, "load", lambda: data)
    return data


async def _decide(client, token, item_id, decision="approved", note=None):
    detail = (await client.get(f"/api/review/items/recitation/{item_id}", headers=auth(token))).json()
    body = {"decision": decision, "hash": detail["langs"]["ar"]["hash"], "note": note}
    return await client.post(f"/api/review/items/recitation/{item_id}/ar", json=body, headers=auth(token))


async def _served(client, lang="ar"):
    return (await client.get(f"/api/discover/recitations?lang={lang}")).json()


def test_knw08_r4_shipped_reciters_are_the_six_decided_hafs_recitations():
    data = recitation.load_verse_reciters()
    assert data["url_pattern"] == "https://files.quranpedia.net/recitations/{id}/{sura:03d}{aya:03d}.mp3"
    assert [r["quranpedia_id"] for r in recitation.verse_reciters()] == SIX
    assert all(r["riwaya"] == "hafs" and "حفص" in r["edition_ar"] for r in recitation.verse_reciters())
    assert data["sample_suras"] and all(1 <= s <= 114 for s in data["sample_suras"])


async def test_knw08_r4_muaiqly_stays_until_a_reciter_is_approved(client, muaiqly):
    r = await _served(client)
    assert r["reciters"] == []
    assert r["recitation"]["id"] == "islamhouse-728787"
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    queue = (await client.get("/api/review/queue?item_type=recitation", headers=auth(reviewer))).json()
    rows = {i["item_id"]: i for i in queue["items"]}
    for n in SIX:  # every reciter waits in the desk, in Arabic only (one file for every language)
        assert rows[f"quranpedia-{n}"]["langs"] == {"ar": {"status": "in_review", "live": False, "note": None}}


async def test_knw08_r4_reviewer_listens_to_a_sample_and_approves_a_reciter(client, muaiqly):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    detail = (await client.get("/api/review/items/recitation/quranpedia-248", headers=auth(reviewer))).json()
    view = detail["langs"]["ar"]["current"]
    assert view["reciter"] == "محمد صديق المنشاوي" and view["riwaya"] == "حفص عن عاصم"
    assert view["url_pattern"] == "https://files.quranpedia.net/recitations/248/{sura:03d}{aya:03d}.mp3"
    assert view["sample_suras"] == recitation.load_verse_reciters()["sample_suras"]

    assert (await _decide(client, reviewer, "quranpedia-248")).status_code == 200
    r = await _served(client)
    assert [x["quranpedia_id"] for x in r["reciters"]] == [248]  # only the approved one
    # The decision is recorded with the reviewer's name and date.
    [h] = (await client.get("/api/review/items/recitation/quranpedia-248", headers=auth(reviewer))).json()["history"]
    assert h["decision"] == "approved" and h["reviewer"] and h["at"]


async def test_knw08_r4_example1_approved_reciter_names_reciter_and_source(client, muaiqly):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _decide(client, reviewer, "quranpedia-255")
    for lang, name in (("ar", "مشاري راشد العفاسي"), ("en", "Mishary Rashid Alafasy"), ("tl", "Mishary Rashid Alafasy")):
        [rec] = (await _served(client, lang))["reciters"]
        assert rec == {
            "id": "quranpedia-255",
            "quranpedia_id": 255,
            "reciter": name,
            "source": "Quranpedia",
            "origin_url": "https://quranpedia.net",
        }


async def test_knw08_r4_returned_reciter_is_withdrawn(client, muaiqly):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await _decide(client, reviewer, "quranpedia-249")
    assert [x["quranpedia_id"] for x in (await _served(client))["reciters"]] == [249]
    await withdraw(client, reviewer, "recitation", "quranpedia-249", "ar", note="في العيّنة مقطع غير واضح")
    assert (await _served(client))["reciters"] == []
    queue = (await client.get("/api/review/queue?item_type=recitation", headers=auth(reviewer))).json()
    row = next(i for i in queue["items"] if i["item_id"] == "quranpedia-249")
    assert row["langs"]["ar"] == {"status": "returned", "live": False, "note": "في العيّنة مقطع غير واضح"}


async def test_knw08_r4_only_the_sharia_reviewer_approves_a_reciter(client, muaiqly):
    team = await with_roles(client, "team-1", "team")
    assert (await _decide(client, team, "quranpedia-251")).status_code == 403
    assert (await _served(client))["reciters"] == []


async def test_knw08_r4_example2_mp3quran_only_reciter_is_not_added(client, muaiqly, monkeypatch):
    """Abdul Basit in Hafs verse by verse exists only on verse.mp3quran.net, whose terms
    are unclear: it is neither offered to the reviewer nor served, even if listed."""
    data = copy.deepcopy(recitation.load_verse_reciters())
    data["reciters"].append(
        {
            "quranpedia_id": 7,
            "riwaya": "hafs",
            "server": "https://verse.mp3quran.net/arabic/abdulbasit/",
            "edition_ar": "مصحف عبد الباسط عبد الصمد برواية حفص عن عاصم",
            "reciter": {"ar": "عبد الباسط عبد الصمد", "en": "Abdul Basit", "tl": "Abdul Basit"},
        }
    )
    monkeypatch.setattr(recitation, "load_verse_reciters", lambda: data)
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    assert (await client.get("/api/review/items/recitation/quranpedia-7", headers=auth(reviewer))).status_code == 404
    queue = (await client.get("/api/review/queue?item_type=recitation", headers=auth(reviewer))).json()
    assert "quranpedia-7" not in {i["item_id"] for i in queue["items"]}

    # A whole file on another host is refused, too.
    other = {**data, "url_pattern": "https://verse.mp3quran.net/arabic/{id}/{sura:03d}{aya:03d}.mp3"}
    monkeypatch.setattr(recitation, "load_verse_reciters", lambda: other)
    assert recitation.verse_reciters() == []


async def test_knw08_r4_hafs_only(client, muaiqly, monkeypatch):
    data = copy.deepcopy(recitation.load_verse_reciters())
    for r in data["reciters"]:
        r["riwaya"] = "warsh"
    monkeypatch.setattr(recitation, "load_verse_reciters", lambda: data)
    assert recitation.verse_reciters() == []
    assert (await _served(client))["reciters"] == []
