"""KNW-08 Quran listening: server side (R4).

Since 2026-10-06 (rules.md §1.4) the recitation is reviewed before it is
merged, so the merged mushaf is served directly; a version the reviewer
returns is withdrawn in that language until corrected."""

import pytest

from app.knowledge import recitation
from tests.conftest import with_roles, withdraw


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


async def test_knw08_r4_merged_recitation_names_reciter_and_source(client, recs):
    rec = (await client.get("/api/discover/recitations?lang=tl")).json()["recitation"]
    assert rec["reciter"] == "Maher Al-Muaiqly" and rec["source"] == "IslamHouse.com"
    assert rec["suras"]["1"].startswith("https://d1.islamhouse.com/")


async def test_knw08_r4_returned_recitation_withdrawn_until_corrected(client, recs):
    reviewer = await with_roles(client, "mohannad-1", "sharia_reviewer")
    await withdraw(client, reviewer, "recitation", "islamhouse-728787", "ar", note="في الملف مؤثرات صوتية")
    assert (await client.get("/api/discover/recitations?lang=ar")).json()["recitation"] is None
    assert (await client.get("/api/discover/recitations?lang=en")).json()["recitation"]["id"] == "islamhouse-728787"
    recs[0]["suras"] = {"1": "https://d1.islamhouse.com/data/ar/ih_quran/y/ar-001-y.mp3"}  # the corrected files are merged
    rec = (await client.get("/api/discover/recitations?lang=ar")).json()["recitation"]
    assert rec["suras"]["1"].endswith("ar-001-y.mp3")


def test_knw08_r4_shipped_file_covers_every_surah():
    if not recitation.recitations_file().exists():
        pytest.skip("recitations file not present")
    [rec] = recitation.load()
    assert sorted(map(int, rec["suras"])) == list(range(1, 115))
    assert all(u.startswith("https://d1.islamhouse.com/") for u in rec["suras"].values())
