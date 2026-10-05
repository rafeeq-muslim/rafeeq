"""KNW-08 Quran listening: server side (R4)."""

import pytest

from app.knowledge import recitation
from tests.test_knw07_daily import approve, with_roles


@pytest.fixture
def recs(monkeypatch):
    data = [
        {
            "id": "islamhouse-728787",
            "islamhouse_id": 728787,
            "reciter": recitation.RECITER,
            "edition": recitation.EDITION,
            "origin_url": "https://islamhouse.com/ar/quran/728787/",
            "suras": {"1": "https://d1.islamhouse.com/data/ar/ih_quran/x/ar-001-x.mp3"},
        }
    ]
    monkeypatch.setattr(recitation, "load", lambda: data)
    return data


async def test_knw08_r4_approved_recitation_names_reciter_and_source(client, recs):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await approve(client, reviewer, "recitation", "islamhouse-728787", "tl")
    rec = (await client.get("/api/discover/recitations?lang=tl")).json()["recitation"]
    assert rec["reciter"] == "Maher Al-Muaiqly" and rec["source"] == "IslamHouse.com"
    assert rec["suras"]["1"].startswith("https://d1.islamhouse.com/")


async def test_knw08_r4_unapproved_recitation_is_not_served(client, recs):
    assert (await client.get("/api/discover/recitations?lang=ar")).json()["recitation"] is None


def test_knw08_r4_shipped_file_covers_every_surah():
    if not recitation.recitations_file().exists():
        pytest.skip("recitations file not present")
    [rec] = recitation.load()
    assert sorted(map(int, rec["suras"])) == list(range(1, 115))
    assert all(u.startswith("https://d1.islamhouse.com/") for u in rec["suras"].values())
