"""Arabic recitation under whole-verse cards (LRN-01 R4, LRN-09 R2).

`content/quran_recitation.json` lists, per verse, the cards that show it and
the Sharia reviewer's status. A card is marked `quran.recite = true` only when
it shows one whole verse (no excerpt: a per-verse file would recite the words
the card hides) and that verse is `approved`. No URL is ever sent: the app
builds it from the file pattern, so a pending verse has nothing to play.

The mark is added to the served lesson, outside the lesson's review view: the
reviewer approves each file in the JSON, not through the lesson's hash."""

import copy
import json
from functools import lru_cache
from typing import Any

from app.core.config import get_settings

FILE = "quran_recitation.json"


def _load() -> dict[str, Any]:
    f = get_settings().content_dir / FILE
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


@lru_cache
def approved() -> dict[str, tuple[int, int]]:
    """card id -> (sura, aya) of the approved verse it shows."""
    out: dict[str, tuple[int, int]] = {}
    for v in _load().get("verses", []):
        if v.get("status") != "approved":
            continue
        sura, aya = (int(x) for x in v["ref"].split(":"))
        for cid in v.get("cards", []):
            out[cid] = (sura, aya)
    return out


def recites(card: dict[str, Any], verses: dict[str, tuple[int, int]]) -> bool:
    q = card.get("quran")
    # Any excerpt key, even one empty in this language, means a partial-verse card.
    if not isinstance(q, dict) or q.get("excerpt") is not None:
        return False
    ayat = q.get("ayat") or [0, 0]
    return verses.get(card.get("id", "")) == (q.get("sura"), ayat[0]) and ayat[0] == ayat[1]


def mark(lesson: dict[str, Any]) -> dict[str, Any]:
    """The lesson with `quran.recite` set on its approved whole-verse cards
    (a copy when anything changes; the review view is never mutated)."""
    verses = approved()
    cards = lesson.get("cards") or []
    if not any(recites(c, verses) for c in cards if isinstance(c, dict)):
        return lesson
    out = {**lesson, "cards": copy.deepcopy(cards)}
    for c in out["cards"]:
        if isinstance(c, dict) and recites(c, verses):
            c["quran"]["recite"] = True
    return out
