"""binbaz.org.sa — fatwas of Sheikh Abdulaziz Ibn Baz (Arabic), via the community dump
github.com/rn0x/binbaz_database (MIT licence covers the scraper code only; the content's
terms are the site's own footer: "جميع الحقوق محفوظة والنقل متاح لكل مسلم بشرط ذكر المصدر").

⚠️ The dump was scraped by a third party (last commit 2024-09-21). Text fidelity against the
live site is not guaranteed; every passage keeps the canonical binbaz.org.sa URL so a refresh
or spot check can compare. AI-assistant use still to be confirmed (KNW-02 open question).

Files used: database/nur_ealaa_aldarb.json, fatawaa_aldurus.json, fatawaa_aljamie_alkabir.json
Record: {id, question, title, answer, link, audio, categories[]}
Books (books_ar.json / books_en.json) are PDF links only and are not normalized here.

Raw:  <raw_dir>/repo/  (git clone --depth 1 https://github.com/rn0x/binbaz_database.git repo)
Run:  cd backend && uv run python -m app.knowledge.sources.binbaz [--fetch]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections.abc import Iterator
from pathlib import Path

from app.knowledge.sources._common import SOURCES_DIR, iso_from_mtime, split_passages, strip_html, write_jsonl

SOURCE_ID = "binbaz"
REPO = "https://github.com/rn0x/binbaz_database.git"
COLLECTIONS = {
    "nur_ealaa_aldarb.json": "نور على الدرب",
    "fatawaa_aljamie_alkabir.json": "فتاوى الجامع الكبير",
    "fatawaa_aldurus.json": "فتاوى الدروس",
}
_FATWA_NO = re.compile(r"/fatwas/(\d+)")


def fetch(raw_dir: Path) -> None:
    repo = raw_dir / "repo"
    if repo.exists():
        subprocess.run(["git", "-C", str(repo), "pull", "--depth", "1"], check=True)
    else:
        raw_dir.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", REPO, str(repo)], check=True)


def _version(repo: Path) -> str:
    try:
        out = subprocess.run(["git", "-C", str(repo), "log", "-1", "--format=%h %cs"], capture_output=True, text=True, check=True)
        sha, day = out.stdout.split()
        return f"rn0x@{sha}/{day}"
    except (OSError, subprocess.CalledProcessError, ValueError):
        return "rn0x@unknown"


def iter_passages(raw_dir: Path) -> Iterator[dict]:
    repo = raw_dir / "repo"
    db = repo / "database"
    if not db.is_dir():
        return
    version = _version(repo)
    seen: set[str] = set()
    for fname, collection in COLLECTIONS.items():
        f = db / fname
        fetched = iso_from_mtime(f)
        for rec in json.loads(f.read_text(encoding="utf-8")):
            m = _FATWA_NO.search(rec.get("link") or "")
            if not m or m.group(1) in seen:
                continue  # no stable id, or the same fatwa listed in two collections
            no = m.group(1)
            seen.add(no)
            title = strip_html(rec.get("title") or "")
            question = strip_html(rec.get("question") or "")
            cats = rec.get("categories") if isinstance(rec.get("categories"), list) else []
            yield from split_passages(
                {
                    "id": f"{SOURCE_ID}:ar:{no}",
                    "source_id": SOURCE_ID,
                    "kind": "fatwa",
                    "lang": "ar",
                    "ref": {"fatwa_id": int(no), "title": title},
                    "ref_key": no,
                    "context_text": title + ("\n\n" + question if question else ""),
                    "meta": {
                        "collection": collection,
                        "categories": cats,
                        "audio": rec.get("audio") or "",
                        "author": "عبد العزيز بن عبد الله بن باز",
                        "dump_record_id": rec.get("id"),
                    },
                    "version": version,
                    # the site needs a slug segment (bare /fatwas/{no} is 404); keep the dump's own link
                    # (any slug redirects to the canonical page, so the short form is a safe fallback)
                    "origin_url": link if len(link := rec.get("link") or "") <= 400 else f"https://binbaz.org.sa/fatwas/{no}/x",
                    "fetched_at": fetched,
                },
                strip_html(rec.get("answer") or ""),
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
