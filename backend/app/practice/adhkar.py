"""PRC-07: daily adhkar from Hisn al-Muslim (data/hisnmuslim/raw).

The files are read exactly as served (never edited, README). Each dhikr
becomes one review-desk item (`dhikr`, `hisn-<ID>`) per language; learners
only receive the Sharia reviewer's approved snapshot (R1, rules.md §1.4).

R2: every Quran span «﴿…﴾» is replaced by a reference to the stored QuranEnc
record ({sura, from, to}); the client fetches the words from
/api/scripture/quran. A dhikr whose spans are not all mapped in
content/practice/adhkar.json is never offered.
R3: the transliteration field is never read; Tagalog has no meaning (no
machine translation).
R4: `repeat` is data shown as text; nothing records reading.
"""

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.knowledge import review
from app.knowledge.review import ReviewItem

LANGS = ("ar", "en", "tl")
ITEM_TYPE = "dhikr"
_SPAN = re.compile(r"﴿(.*?)﴾", re.S)
_PUNCT_ONLY = re.compile(r"^[\s.,،؛:*]*$")  # the full stop left after a verse span is not a text of its own


def _load(path: Path) -> dict:
    """Lenient parse of a served file (source defects listed in the README)."""
    text = path.read_text(encoding="utf-8-sig")
    try:
        return json.loads(text, strict=False)
    except json.JSONDecodeError:
        fixed = re.sub(r'^(\s*"[^"\r\n]*):\s*$', r'\1":', text, count=1, flags=re.M)
        return json.loads(fixed, strict=False)


@dataclass
class Chapter:
    id: int
    group: str
    title: dict[str, str]
    items: list[dict[str, Any]] = field(default_factory=list)  # Arabic records
    english: dict[int, dict[str, Any]] = field(default_factory=dict)


@dataclass
class Library:
    source: dict[str, Any]
    groups: list[dict[str, Any]]
    chapters: dict[int, Chapter]
    verses: dict[int, dict[str, Any]]


def _config() -> dict:
    return json.loads((get_settings().content_dir / "practice" / "adhkar.json").read_text(encoding="utf-8"))


@lru_cache
def library() -> Library:
    cfg = _config()
    raw = get_settings().hisnmuslim_dir / "raw"
    chapters: dict[int, Chapter] = {}
    for g in cfg["groups"]:
        for cid in g["chapters"]:
            ar_file, en_file = raw / "ar" / f"{cid}.json", raw / "en" / f"{cid}.json"
            if not ar_file.exists():
                continue
            ((ar_title, ar_items),) = _load(ar_file).items()
            ch = Chapter(cid, g["key"], {"ar": ar_title.strip()}, list(ar_items))
            if en_file.exists():
                ((en_title, en_items),) = _load(en_file).items()
                ch.title["en"] = en_title.strip()
                ch.english = {int(x["ID"]): x for x in en_items}
            chapters[cid] = ch
    verses = {int(k): v for k, v in cfg.get("verses", {}).items()}
    excluded = {int(k) for k in cfg.get("excluded", {})}
    for ch in chapters.values():
        ch.items = [x for x in ch.items if int(x["ID"]) not in excluded]
    return Library(cfg["source"], cfg["groups"], chapters, verses)


def segments(arabic: str, refs: list[list[int]] | None) -> list[dict[str, Any]] | None:
    """Split the Arabic text around Quran spans (R2). None when a span has no reference."""
    spans = list(_SPAN.finditer(arabic))
    if spans and (refs is None or len(refs) != len(spans)):
        return None
    out: list[dict[str, Any]] = []
    pos = 0
    for m, ref in zip(spans, refs or [], strict=False):
        before = arabic[pos : m.start()].strip()
        if not _PUNCT_ONLY.match(before):
            out.append({"t": "text", "text": before})
        sura, start, end = ref
        out.append({"t": "quran", "sura": sura, "from": start, "to": end})
        pos = m.end()
    rest = arabic[pos:].strip()
    if not _PUNCT_ONLY.match(rest):
        out.append({"t": "text", "text": rest})
    return out


def audio_path(dhikr_id: int) -> Path:
    return get_settings().hisnmuslim_dir / "audio" / "ar" / f"{dhikr_id}.mp3"


def view(ch: Chapter, item: dict[str, Any], lang: str, verses: dict[int, dict[str, Any]]) -> dict[str, Any] | None:
    """What a learner reads for one dhikr in one language, or None if it cannot be offered."""
    did = int(item["ID"])
    mapping = verses.get(did)
    segs = segments(item["ARABIC_TEXT"], mapping["refs"] if mapping else None)
    if segs is None:
        return None
    meaning = None
    if lang == "en":
        en = ch.english.get(did)
        if en and (mapping is None or mapping.get("en_meaning", False)):
            meaning = (en.get("TRANSLATED_TEXT") or "").strip() or None
    return {
        "title": ch.title.get(lang) or ch.title["ar"],
        "chapter": ch.id,
        "segments": segs,
        "meaning": meaning,
        "repeat": int(item.get("REPEAT") or 1),
        "audio": audio_path(did).exists(),
    }


def _review_items() -> Iterable[ReviewItem]:
    lib = library()
    order = [cid for g in lib.groups for cid in g["chapters"]]
    for cid, ch in lib.chapters.items():
        for i, item in enumerate(ch.items):
            views = {lg: v for lg in LANGS if (v := view(ch, item, lg, lib.verses)) is not None}
            if views:
                yield ReviewItem(ITEM_TYPE, f"hisn-{item['ID']}", order=(order.index(cid), i), group=str(cid), views=views)


review.register(ITEM_TYPE, _review_items)


def chapter_items(cid: int) -> list[tuple[str, dict[str, Any]]]:
    """(item_id, Arabic record) in source order."""
    ch = library().chapters.get(cid)
    return [(f"hisn-{x['ID']}", x) for x in ch.items] if ch else []
