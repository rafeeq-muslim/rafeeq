"""HadeethEnc.com (ICSA) — explained hadith with grade, in ar / en / tl.

API (verified 2026-10-05, no key):
  GET https://hadeethenc.com/api/v1/languages
  GET https://hadeethenc.com/api/v1/categories/roots/?language={lang}
  GET https://hadeethenc.com/api/v1/categories/list/?language={lang}
  GET https://hadeethenc.com/api/v1/hadeeths/list/?language={lang}&category_id={id}&page={n}&per_page={m}
      -> {"data": [{id, title, translations}], "meta": {current_page, last_page, total_items, per_page}}
  GET https://hadeethenc.com/api/v1/hadeeths/one/?language={lang}&id={id}
      -> id, title, hadeeth, attribution, grade, explanation, hints[], categories[], translations[],
         hadeeth_intro, words_meanings[], reference, (non-ar) hadeeth_ar, hadeeth_intro_ar, ...
Terms: same as QuranEnc (no modification, cite, keep updated) — mode Index in docs/agents/sources.md.

Raw:  <raw_dir>/<lang>/<id>.json  (one API response per hadith)
Run:  cd backend && uv run python -m app.knowledge.sources.hadeethenc [--fetch] [--langs ar,en,tl]
"""

from __future__ import annotations

import argparse
import json
import time
from collections.abc import Iterator
from pathlib import Path

from app.knowledge.sources._common import SOURCES_DIR, iso_from_mtime, make_passage, strip_html, write_jsonl

SOURCE_ID = "hadeethenc"
API = "https://hadeethenc.com/api/v1"
LANGS = ("ar", "en", "tl")
RATE = 4.0  # requests per second, kept under the 5 req/s ceiling
BATCH = 50  # ids per /hadeeths/multiple/ call (50 verified 2026-10-05)


def fetch(raw_dir: Path, langs: tuple[str, ...] = LANGS) -> None:
    import httpx

    with httpx.Client(timeout=60, headers={"User-Agent": "Rafeeq-KNW02/0.1 (contact: project owner)"}) as c:
        last = 0.0

        def get(path: str, **params):
            nonlocal last
            wait = 1 / RATE - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
            for attempt in range(4):
                try:
                    last = time.monotonic()
                    r = c.get(f"{API}{path}", params=params)
                    r.raise_for_status()
                    return r.json()
                except (httpx.HTTPError, ValueError):
                    time.sleep(2 * (attempt + 1))
            raise RuntimeError(f"failed {path} {params}")

        for lang in langs:
            d = raw_dir / lang
            d.mkdir(parents=True, exist_ok=True)
            roots = get("/categories/roots/", language=lang)
            (d / "_roots.json").write_text(json.dumps(roots, ensure_ascii=False))
            cats = get("/categories/list/", language=lang)
            (d / "_categories.json").write_text(json.dumps(cats, ensure_ascii=False))
            ids: list[str] = []
            for root in roots:
                page = 1
                while True:
                    res = get("/hadeeths/list/", language=lang, category_id=root["id"], page=page, per_page=1000)
                    ids += [h["id"] for h in res["data"]]
                    if page >= int(res["meta"]["last_page"]):
                        break
                    page += 1
            uniq = sorted(set(ids), key=int)
            (d / "_ids.json").write_text(json.dumps(uniq))
            print(f"{lang}: {len(ids)} listed, {len(uniq)} unique")
            # /hadeeths/multiple/ returns the same fields as /hadeeths/one/, BATCH ids per call
            missing = [h for h in uniq if not (d / f"{h}.json").exists()]
            for i in range(0, len(missing), BATCH):
                for h in get("/hadeeths/multiple/", language=lang, ids=",".join(missing[i : i + BATCH])):
                    (d / f"{h['id']}.json").write_text(json.dumps(h, ensure_ascii=False))
                print(f"  {lang} {min(i + BATCH, len(missing))}/{len(missing)}", flush=True)


def iter_passages(raw_dir: Path) -> Iterator[dict]:
    for lang in LANGS:
        d = raw_dir / lang
        if not d.is_dir():
            continue
        cats = {}
        cf = d / "_categories.json"
        if cf.exists():
            cats = {c["id"]: c["title"] for c in json.loads(cf.read_text())}
        for f in sorted(d.glob("[0-9]*.json"), key=lambda p: int(p.stem)):
            h = json.loads(f.read_text())
            text = strip_html(h.get("hadeeth") or "")
            hid = str(h.get("id") or f.stem)
            explanation = strip_html(h.get("explanation") or "")
            hints = [strip_html(x) for x in (h.get("hints") or []) if x and x.strip()]
            # context_text = the source's own explanation + benefits, unmodified (plan §3.4)
            context = explanation + ("\n\n" + "\n".join(hints) if hints else "")
            yield make_passage(
                id=f"{SOURCE_ID}:{lang}:{hid}",
                source_id=SOURCE_ID,
                kind="hadith",
                lang=lang,
                ref={"hadith_id": int(hid)},
                ref_key=hid,
                quote_text=text,
                context_text=context,
                meta={
                    "title": strip_html(h.get("title") or ""),
                    "grade": h.get("grade") or "",
                    "attribution": h.get("attribution") or "",
                    "reference": h.get("reference") or "",
                    "hints": hints,
                    "words_meanings": h.get("words_meanings") or [],
                    "hadeeth_ar": h.get("hadeeth_ar") or (text if lang == "ar" else ""),
                    "categories": [{"id": c, "title": cats.get(c, "")} for c in (h.get("categories") or [])],
                    "translations": h.get("translations") or [],
                },
                # The API exposes no version number; the fetch date is the version.
                version=f"api-v1@{iso_from_mtime(f)[:10]}",
                origin_url=f"https://hadeethenc.com/{lang}/browse/hadith/{hid}",
                fetched_at=iso_from_mtime(f),
            )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--langs", default=",".join(LANGS))
    a = ap.parse_args()
    raw = SOURCES_DIR / SOURCE_ID
    if a.fetch:
        fetch(raw, tuple(a.langs.split(",")))
    write_jsonl(SOURCE_ID, iter_passages(raw))


if __name__ == "__main__":
    main()
