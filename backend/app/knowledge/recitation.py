"""KNW-08: the recited mushaf learners listen to.

Plan §8.5 step 1, checked 2026-10-05: IslamHouse recitation 728787 («المصحف
المرتل للقارئ ماهر المعيقلي [نسخة مجمع الملك فهد]») has one MP3 per surah on
d1.islamhouse.com; the IslamHouse policy allows audio in apps (R4). The
mushaf is one KNW-05 review item (`recitation`): the Sharia reviewer listens
before learners get it (no music or effects, R1).

Fetch: `uv run python -m app.knowledge.recitation --fetch`

R2/R4 (decision 2026-10-06): six Quranpedia per-verse Hafs recitations
(`content/discover/verse_reciters.json`), played verse by verse so the
highlighted verse is exactly the file playing. Each reciter is a gated
`recitation` item: learners get it only once it is approved in the desk (one
decision, in Arabic: the audio is the same in every language), by the Sharia
reviewer on a sample of its surahs or, for the six decided ones, by the product
owner's blanket approval of 2026-10-06 recorded at start (owner_approvals.py);
a later return by the reviewer withdraws it. Until one is approved, al-Muaiqly
stays. Only the decided reciters, on Quranpedia's own host, in Hafs: anything
else in the file (another riwaya, a reciter hosted on verse.mp3quran.net, whose
terms are unclear) is never offered or reviewed.
"""

import argparse
import json
import re
from collections.abc import Iterable
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.knowledge import review
from app.knowledge.review import ReviewItem

ITEM_TYPE = "recitation"
LANGS = ("ar", "en", "tl")
API = "https://api3.islamhouse.com/v3/paV29H2gm56kvLPy"
RECITATION_ID = 728787
RECITER = {"ar": "ماهر بن حمد المعيقلي", "en": "Maher Al-Muaiqly", "tl": "Maher Al-Muaiqly"}
EDITION = {
    "ar": "المصحف المرتل، نسخة مجمع الملك فهد لطباعة المصحف الشريف",
    "en": "Recited mushaf, King Fahd Complex edition",
    "tl": "Recited mushaf, King Fahd Complex edition",
}


def recitations_file() -> Path:
    return get_settings().content_dir / "discover" / "recitations.json"


@lru_cache
def load() -> list[dict[str, Any]]:
    f = recitations_file()
    if not f.exists():
        return []
    return json.loads(f.read_text(encoding="utf-8"))["recitations"]


# --- R2/R4: Quranpedia per-verse reciters -----------------------------------------

QURANPEDIA_IDS = (248, 249, 251, 253, 254, 255)  # decision 2026-10-06 (KNW-08 R4)
QURANPEDIA_PATTERN = "https://files.quranpedia.net/recitations/{id}/{sura:03d}{aya:03d}.mp3"


def verse_reciters_file() -> Path:
    return get_settings().content_dir / "discover" / "verse_reciters.json"


@lru_cache
def load_verse_reciters() -> dict[str, Any]:
    f = verse_reciters_file()
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def verse_reciters() -> list[dict[str, Any]]:
    """The decided reciters only: Hafs, on files.quranpedia.net, one of the six ids."""
    data = load_verse_reciters()
    if data.get("url_pattern") != QURANPEDIA_PATTERN:
        return []
    return [r for r in data.get("reciters", []) if r.get("riwaya") == "hafs" and r.get("quranpedia_id") in QURANPEDIA_IDS]


def reciter_id(r: dict) -> str:
    return f"quranpedia-{r['quranpedia_id']}"


def reciter_review_view(r: dict) -> dict:
    """What the reviewer approves: the reciter, the recitation and the sample to listen to."""
    data = load_verse_reciters()
    return {
        "title": r["edition_ar"],
        "reciter": r["reciter"]["ar"],
        "riwaya": "حفص عن عاصم",
        "source": data["source"],
        "quranpedia_id": r["quranpedia_id"],
        "url_pattern": data["url_pattern"].replace("{id}", str(r["quranpedia_id"])),
        "sample_suras": data.get("sample_suras", []),
    }


def reciter_view(r: dict, lang: str) -> dict:
    """What learners get once the reciter is approved; the app builds each verse's URL."""
    data = load_verse_reciters()
    return {
        "id": reciter_id(r),
        "quranpedia_id": r["quranpedia_id"],
        "reciter": r["reciter"][lang],
        "source": data["source"],
        "origin_url": data["origin_url"],
    }


async def approved_reciters(session: AsyncSession, lang: str) -> list[dict]:
    ok = await review.approved_ids(session, ITEM_TYPE, "ar")
    return [reciter_view(r, lang) for r in verse_reciters() if reciter_id(r) in ok]


def view(rec: dict, lang: str) -> dict:
    return {
        "id": rec["id"],
        "title": rec["edition"][lang],
        "reciter": rec["reciter"][lang],
        "source": "IslamHouse.com",
        "origin_url": rec["origin_url"],
        "suras": rec["suras"],
    }


def _review_items() -> Iterable[ReviewItem]:
    for i, rec in enumerate(load()):
        yield ReviewItem(ITEM_TYPE, rec["id"], order=(i,), group="quran", views={lg: view(rec, lg) for lg in LANGS})
    for i, r in enumerate(verse_reciters()):
        yield ReviewItem(ITEM_TYPE, reciter_id(r), order=(1, i), group="quran", views={"ar": reciter_review_view(r)}, gated=True)


review.register(ITEM_TYPE, _review_items)


def fetch() -> dict:
    data = httpx.get(f"{API}/quran/get-recitation/{RECITATION_ID}/ar/json", timeout=30).json()
    suras: dict[str, str] = {}
    for a in data.get("attachments") or []:
        m = re.search(r"-(\d{3})-", a.get("title", "") + "-")
        n = int(m.group(1)) if m else int(a["order"])
        if 1 <= n <= 114 and a["url"].startswith("https://d1.islamhouse.com/"):
            suras[str(n)] = a["url"]
    return {
        "note": "KNW-08 recitations (IslamHouse API v3, links only). Not shown before the Sharia reviewer has listened and approved.",
        "fetched": datetime.now(UTC).date().isoformat(),
        "recitations": [
            {
                "id": f"islamhouse-{RECITATION_ID}",
                "islamhouse_id": RECITATION_ID,
                "islamhouse_title": data.get("title", ""),
                "reciter": RECITER,
                "edition": EDITION,
                "origin_url": f"https://islamhouse.com/ar/quran/{RECITATION_ID}/",
                "suras": suras,
            }
        ],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    if ap.parse_args().fetch:
        data = fetch()
        f = recitations_file()
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{len(data['recitations'][0]['suras'])} suras → {f}")


if __name__ == "__main__":
    main()
