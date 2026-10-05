"""enc.islamhouse.com (IslamHouse encyclopedia) — books as phrase-aligned Arabic + translations.

Used now for ONE book: «المختصر المفيد للمسلم الجديد — الطبعة الأولى» / "NEW MUSLIM GUIDELINE"
(Muhammad al-Shahri, 1441 H / 2020), enc book 160, Arabic + English. It is the book the learning
path is built on (LRN-01). The enc site has no Tagalog edition of it (verified 2026-10-05).

API (linked as "API Docs" from enc.islamhouse.com; Postman 5211979/2s8YzMZ6Fu), base https://cnt.islamhouse.com/api/v1:
  GET books/book-info/{id}?locale=ar                 -> {"data": {id, title, languages[], ...}, "meta": {"total_pages"}}
  GET books/page-data/{id}?page_number=N&transes=en  -> {"data": [{id, tag: h1|h2|p, type, splitted, split_group,
                                                                    original_text, page_number, transes: {en}}]}
Terms: IslamHouse policy (apps, offline, RAG/AI allowed; text unchanged; cite; keep version).
⚠️ That enc.islamhouse.com is covered by the IslamHouse README policy is an inference; confirm with
admin@islamhouse.com. The author's permission for the whole book is recorded in docs/agents/sources.md.

Passages: one per heading section (h1/h2) per language, phrases joined in source order
(a phrase split for alignment is re-joined with a space, other phrases with a newline). No letter changes.

Raw:  <raw_dir>/book_{id}/info.json, <raw_dir>/book_{id}/page_{n}.json
Run:  cd backend && uv run python -m app.knowledge.sources.islamhouse_enc [--fetch]
"""

from __future__ import annotations

import argparse
import json
import time
from collections.abc import Iterator
from pathlib import Path

from app.knowledge.sources._common import SOURCES_DIR, iso_from_mtime, split_passages, strip_html, write_jsonl

SOURCE_ID = "islamhouse_enc"
API = "https://cnt.islamhouse.com/api/v1"
BOOKS = {160: ("en",)}  # book id -> translation languages to fetch alongside Arabic


def fetch(raw_dir: Path) -> None:
    import httpx

    with httpx.Client(timeout=60) as c:
        for book, transes in BOOKS.items():
            d = raw_dir / f"book_{book}"
            d.mkdir(parents=True, exist_ok=True)
            info = c.get(f"{API}/books/book-info/{book}", params={"locale": "ar"}).json()
            (d / "info.json").write_text(json.dumps(info, ensure_ascii=False))
            for n in range(1, int(info["meta"]["total_pages"]) + 1):
                r = c.get(f"{API}/books/page-data/{book}", params={"page_number": n, "transes": ",".join(transes)})
                r.raise_for_status()
                (d / f"page_{n}.json").write_text(r.text)
                time.sleep(0.5)


def _sections(rows: list[dict], lang: str) -> list[tuple[str, int, str]]:
    """-> [(heading, first_page, text)] in source order."""
    out: list[tuple[str, int, list[str]]] = []
    prev_group = None
    for r in rows:
        text = r["original_text"] if lang == "ar" else (r.get("transes") or {}).get(lang, "")
        text = strip_html(text or "")
        if r.get("tag") in ("h1", "h2"):
            out.append((text, int(r["page_number"]), []))
            prev_group = None
            continue
        if not out:
            out.append(("", int(r["page_number"]), []))
        if not text:
            continue
        group = str(r.get("split_group") or "0")
        parts = out[-1][2]
        if group != "0" and group == prev_group and parts:
            parts[-1] = parts[-1] + " " + text
        else:
            parts.append(text)
        prev_group = group
    return [(h, p, "\n".join(t)) for h, p, t in out if t]


def iter_passages(raw_dir: Path) -> Iterator[dict]:
    for book, transes in BOOKS.items():
        d = raw_dir / f"book_{book}"
        if not (d / "info.json").exists():
            continue
        info = json.loads((d / "info.json").read_text())["data"]
        pages = sorted(d.glob("page_*.json"), key=lambda p: int(p.stem.split("_")[1]))
        rows = [r for f in pages for r in json.loads(f.read_text())["data"]]
        fetched = iso_from_mtime(pages[0]) if pages else iso_from_mtime(d / "info.json")
        for lang in ("ar", *transes):
            for i, (heading, page, text) in enumerate(_sections(rows, lang), 1):
                yield from split_passages(
                    {
                        "id": f"{SOURCE_ID}:{book}:{lang}:s{i}",
                        "source_id": SOURCE_ID,
                        "kind": "book_section",
                        "lang": lang,
                        "ref": {"book_id": book, "section": i, "page": page, "title": heading},
                        "ref_key": f"{book}:s{i}",
                        "context_text": heading,
                        "meta": {
                            "book_title": info.get("title", ""),
                            "book_title_en": "NEW MUSLIM GUIDELINE" if book == 160 else "",
                            "author": "محمد الشهري / Muhammad al-Shahri",
                            "edition": "1441 H / 2020 (enc book 160)",
                        },
                        "version": f"enc-api@{fetched[:10]}",
                        "origin_url": f"https://enc.islamhouse.com/{lang}/books/{book}/{page}",
                        "fetched_at": fetched,
                    },
                    text,
                )


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
