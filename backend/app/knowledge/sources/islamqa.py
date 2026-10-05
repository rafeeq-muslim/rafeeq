"""islamqa.info — Q&A (fatwas) and articles, ar / en, from the site's own offline dump.

⚠️ Licence: the site's Terms of Use say "1. Personal Uses Permitted" and forbid
use "for commercial purposes". Index mode is an OWNER DECISION (2026-10-05) with a
permission request still to send — see docs/agents/sources.md. The raw dump and
the JSONL stay outside the public repo.

Where the dump comes from (found in the site's JS bundle, 2026-10-05):
  manifest: https://files.zadapps.info/m.islamqa.info/dumps/manifest.json
            -> {"dumps": [{"folder": "dumps/<stamp>/<lang>", "lang", "file": {"name": "data.ndjson.gz", ...}}]}
  file:     https://files.zadapps.info/m.islamqa.info/<folder>/<name>
Each line: {"serial", "op": "created"|..., "type": "answer"|"article"|"research"|"book"|"topic"|..., "data": {...}}
Answer fields: reference, title, question (HTML), body (HTML), source{reference,title}, topics[], createdAt, updatedAt, ...

Raw:  <raw_dir>/manifest.json, <raw_dir>/<lang>/data.ndjson.gz
Run:  cd backend && uv run python -m app.knowledge.sources.islamqa [--fetch]
"""

from __future__ import annotations

import argparse
import gzip
import json
from collections.abc import Iterator
from pathlib import Path

from app.knowledge.sources._common import SOURCES_DIR, iso_from_mtime, split_passages, strip_html, write_jsonl

SOURCE_ID = "islamqa"
BASE = "https://files.zadapps.info/m.islamqa.info"
LANGS = ("ar", "en")
# type in dump -> (kind, URL path segment)
TYPES = {"answer": ("fatwa", "answers"), "article": ("article", "articles"), "research": ("article", "researches")}


def fetch(raw_dir: Path, langs: tuple[str, ...] = LANGS) -> None:
    import httpx

    raw_dir.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=600, follow_redirects=True) as c:
        manifest = c.get(f"{BASE}/dumps/manifest.json").json()
        (raw_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
        for d in manifest["dumps"]:
            if d["lang"] not in langs:
                continue
            out = raw_dir / d["lang"] / d["file"]["name"]
            out.parent.mkdir(parents=True, exist_ok=True)
            with c.stream("GET", f"{BASE}/{d['folder']}/{d['file']['name']}") as r, out.open("wb") as f:
                r.raise_for_status()
                for chunk in r.iter_bytes():
                    f.write(chunk)
            print(f"{d['lang']}: {out.stat().st_size} bytes from {d['folder']}")


def _version(raw_dir: Path, lang: str) -> str:
    try:
        for d in json.loads((raw_dir / "manifest.json").read_text())["dumps"]:
            if d["lang"] == lang:
                return "dump-" + d["folder"].split("/")[1][:10]  # dump-2026-10-04
    except (OSError, KeyError, ValueError):
        pass
    return "dump-unknown"


def _names(x) -> list[str]:
    return [t.get("title", "") for t in x] if isinstance(x, list) else []


def iter_passages(raw_dir: Path) -> Iterator[dict]:
    for lang in LANGS:
        f = raw_dir / lang / "data.ndjson.gz"
        if not f.exists():
            continue
        version, fetched = _version(raw_dir, lang), iso_from_mtime(f)
        latest: dict[tuple[str, str], dict | None] = {}
        with gzip.open(f, "rt", encoding="utf-8") as fh:
            for line in fh:
                r = json.loads(line)
                if r.get("type") not in TYPES:
                    continue
                key = (r["type"], str(r["data"].get("reference")))
                latest[key] = None if r.get("op") == "deleted" else r["data"]
        for (typ, ref), d in sorted(latest.items(), key=lambda kv: (kv[0][0], int(kv[0][1]))):
            if not d:
                continue
            kind, seg = TYPES[typ]
            body = strip_html(d.get("body") or "")
            title = strip_html(d.get("title") or "")
            question = strip_html(d.get("question") or "") if typ == "answer" else ""
            context = title + ("\n\n" + question if question else "")
            src = d.get("source") if isinstance(d.get("source"), dict) else {}
            pid = f"{SOURCE_ID}:{lang}:{ref}" if typ == "answer" else f"{SOURCE_ID}:{lang}:{typ}:{ref}"
            yield from split_passages(
                {
                    "id": pid,
                    "source_id": SOURCE_ID,
                    "kind": kind,
                    "lang": lang,
                    "ref": {"question_id" if typ == "answer" else f"{typ}_id": int(ref), "title": title},
                    "ref_key": ref if typ == "answer" else f"{typ}:{ref}",
                    "context_text": context,
                    "meta": {
                        "type": typ,
                        "topics": _names(d.get("topics")),
                        "answered_by": src.get("title", ""),
                        "created_at": d.get("createdAt") or "",
                        "updated_at": d.get("updatedAt") or "",
                        "content_langs": d.get("contentLangs") if isinstance(d.get("contentLangs"), list) else [],
                        "licence": "personal-use; owner decision 2026-10-05, permission pending",
                    },
                    "version": version,
                    "origin_url": f"https://islamqa.info/{lang}/{seg}/{ref}",
                    "fetched_at": fetched,
                },
                body,
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
