"""PLT-11 R5: the whole-surah recitation carries each surah file's size, so the
app can show it before anything plays (and PLT-12 before a download)."""

import pytest

from app.knowledge import recitation


@pytest.fixture
def recs(monkeypatch):
    data = [
        {
            "id": "islamhouse-728787",
            "islamhouse_id": 728787,
            "reciter": recitation.RECITER,
            "edition": recitation.EDITION,
            "origin_url": "https://islamhouse.com/ar/quran/728787/",
            "suras": {"2": "https://d1.islamhouse.com/data/ar/ih_quran/x/ar-002-x.mp3"},
            "sizes": {"2": 206968793},
        }
    ]
    monkeypatch.setattr(recitation, "load", lambda: data)
    return data


async def test_plt11_r5_recitation_response_passes_surah_sizes(client, recs):
    rec = (await client.get("/api/discover/recitations?lang=en")).json()["recitation"]
    assert rec["sizes"] == {"2": 206968793}


def test_plt11_r5_sizes_do_not_change_the_reviewed_version(recs):
    """The sizes are not part of what the Sharia reviewer approved."""
    with_sizes = recitation.view(recs[0], "ar")
    without = recitation.view({k: v for k, v in recs[0].items() if k != "sizes"}, "ar")
    assert with_sizes == without and "sizes" not in with_sizes


def test_plt11_r5_shipped_file_has_a_size_for_every_surah():
    if not recitation.recitations_file().exists():
        pytest.skip("recitations file not present")
    recitation.load.cache_clear()
    [rec] = recitation.load()
    assert sorted(map(int, rec["sizes"])) == list(range(1, 115))
    assert rec["sizes"]["2"] > 200_000_000  # Al-Baqarah, measured 2026-10-06: ~207 MB
