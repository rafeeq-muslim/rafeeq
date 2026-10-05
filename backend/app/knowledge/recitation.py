"""KNW-08: the recited mushaf learners listen to.

Plan §8.5 step 1, checked 2026-10-05: IslamHouse recitation 728787 («المصحف
المرتل للقارئ ماهر المعيقلي [نسخة مجمع الملك فهد]») has one MP3 per surah on
d1.islamhouse.com; the IslamHouse policy allows audio in apps (R4). The
mushaf is one KNW-05 review item (`recitation`): the Sharia reviewer listens
before learners get it (no music or effects, R1).

Fetch: `uv run python -m app.knowledge.recitation --fetch`
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
