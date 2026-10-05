"""QuranEnc.com (ICSA) — Quran Arabic text, translations of the meanings, Arabic tafsir.

Verified 2026-10-05:
  GET https://quranenc.com/api/v1/translations/list[/{lang}]   -> {"translations": [{key, version, last_update, ...}]}
  GET https://quranenc.com/api/v1/translation/sura/{key}/{sura} -> {"result": [{id, sura, aya, arabic_text, translation, footnotes}]}
  GET https://quranenc.com/api/v1/translation/aya/{key}/{sura}/{aya}
  SQLite: https://quranenc.com/downloads/sqlite/{key}.sqlite   table translations(id, sura, aya, translation, footnotes)
          (no Arabic text inside; the Arabic comes from the API's arabic_text field)
Keys used:
  tagalog_rwwad (tl), english_saheeh + english_rwwad (en)      -> quran_translation
  arabic_moyassar (التفسير الميسر), arabic_mokhtasar (المختصر في التفسير) -> quran_tafsir (ar)
      both work in the API and as SQLite but are NOT in /translations/list, so they carry no version number.
  arabic_text from the API                                     -> quran_arabic (ar)
Terms: no modification; cite QuranEnc.com; show the version; keep updated (docs/agents/sources.md, mode Index).

Raw:  <raw_dir>/translations_list.json, <raw_dir>/{key}.sqlite, <raw_dir>/arabic/{sura}.json
Run:  cd backend && uv run python -m app.knowledge.sources.quranenc [--fetch]
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import time
from collections.abc import Iterator
from pathlib import Path

from app.knowledge.sources._common import SOURCES_DIR, iso_from_mtime, make_passage, strip_html, write_jsonl

SOURCE_ID = "quranenc"
SITE = "https://quranenc.com"
# key -> (lang, kind)
KEYS = {
    "tagalog_rwwad": ("tl", "quran_translation"),
    "english_saheeh": ("en", "quran_translation"),
    "english_rwwad": ("en", "quran_translation"),
    "arabic_moyassar": ("ar", "quran_tafsir"),
    "arabic_mokhtasar": ("ar", "quran_tafsir"),
}
ARABIC_VIA = "arabic_moyassar"  # any key returns the same arabic_text; this one browses in Arabic


def fetch(raw_dir: Path) -> None:
    import httpx

    raw_dir.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=300, follow_redirects=True) as c:
        (raw_dir / "translations_list.json").write_text(c.get(f"{SITE}/api/v1/translations/list").text)
        for key in KEYS:
            r = c.get(f"{SITE}/downloads/sqlite/{key}.sqlite")
            r.raise_for_status()
            (raw_dir / f"{key}.sqlite").write_bytes(r.content)
            time.sleep(0.5)
        ad = raw_dir / "arabic"
        ad.mkdir(exist_ok=True)
        for sura in range(1, 115):
            f = ad / f"{sura}.json"
            if f.exists():
                continue
            r = c.get(f"{SITE}/api/v1/translation/sura/{ARABIC_VIA}/{sura}")
            r.raise_for_status()
            f.write_text(r.text)
            time.sleep(0.25)


def _versions(raw_dir: Path) -> dict[str, str]:
    try:
        return {t["key"]: t["version"] for t in json.loads((raw_dir / "translations_list.json").read_text())["translations"]}
    except (OSError, KeyError, ValueError):
        return {}


def iter_passages(raw_dir: Path) -> Iterator[dict]:
    versions = _versions(raw_dir)
    ad = raw_dir / "arabic"
    if ad.is_dir():
        for f in sorted(ad.glob("*.json"), key=lambda p: int(p.stem)):
            fetched = iso_from_mtime(f)
            for a in json.loads(f.read_text())["result"]:
                s, n = int(a["sura"]), int(a["aya"])
                yield make_passage(
                    id=f"{SOURCE_ID}:ar:{s}:{n}",
                    source_id=SOURCE_ID,
                    kind="quran_arabic",
                    lang="ar",
                    ref={"sura": s, "aya": n},
                    ref_key=f"{s}:{n}",
                    quote_text=a["arabic_text"],
                    meta={"script": "uthmani (as served by QuranEnc API)"},
                    version=f"api-v1@{fetched[:10]}",
                    origin_url=f"{SITE}/ar/browse/{ARABIC_VIA}/{s}#{n}",
                    fetched_at=fetched,
                )
    for key, (lang, kind) in KEYS.items():
        db = raw_dir / f"{key}.sqlite"
        if not db.exists():
            continue
        fetched = iso_from_mtime(db)
        version = versions.get(key) or f"unlisted@{fetched[:10]}"
        con = sqlite3.connect(db)
        try:
            for s, n, text, notes in con.execute("SELECT sura, aya, translation, footnotes FROM translations ORDER BY id"):
                yield make_passage(
                    id=f"{SOURCE_ID}:{key}:{s}:{n}",
                    source_id=SOURCE_ID,
                    kind=kind,
                    lang=lang,
                    ref={"sura": int(s), "aya": int(n), "key": key},
                    ref_key=f"{s}:{n}",
                    quote_text=strip_html(text or ""),
                    context_text=strip_html(notes or ""),  # footnotes, as served
                    meta={"translation_key": key},
                    version=version,
                    origin_url=f"{SITE}/{lang}/browse/{key}/{s}/{n}",
                    fetched_at=fetched,
                )
        finally:
            con.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    a = ap.parse_args()
    raw = SOURCES_DIR / SOURCE_ID
    if a.fetch:
        fetch(raw)
    write_jsonl(SOURCE_ID, iter_passages(raw))


if __name__ == "__main__":
    main()
