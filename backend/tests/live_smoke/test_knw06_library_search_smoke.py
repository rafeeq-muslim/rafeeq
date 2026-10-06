"""PRD-LIBRARY-LIVE-SEARCH §9/§10: opt-in, bounded live check of the library
search against the REAL sites, from this backend. Never runs in CI: skipped
unless RAFEEQ_LIVE_SMOKE=1 is set by a person on purpose.

  RAFEEQ_LIVE_SMOKE=1 uv run pytest -q -s tests/live_smoke/test_knw06_library_search_smoke.py
  (RAFEEQ_LIVE_SMOKE_OUT=path also writes the results as JSON for the report)

Polite by construction: a handful of public topic words (never user text),
one search page each plus one "load more", at most
LIBRARY_SEARCH_MAX_CALLS_PER_SOURCE requests per page, an honest User-Agent,
a pause between searches. The encyclopedia's search is NOT called unless
ASK_LIVE_ISLAMIC_CONTENT_SEARCH_PERMITTED=true (robots.txt disallows it)."""

import asyncio
import json
import os
import time
from pathlib import Path

import pytest

from app.knowledge import library_search

pytestmark = pytest.mark.skipif(os.environ.get("RAFEEQ_LIVE_SMOKE") != "1", reason="opt-in live smoke test (RAFEEQ_LIVE_SMOKE=1)")

CASES = [("ar", "فضل الوضوء"), ("ar", "الصلاة"), ("en", "wudu"), ("en", "new muslim"), ("tl", "pagdarasal")]
RESULTS: list[dict] = []


async def test_knw06_library_search_live_islamhouse():
    library_search.reset()
    for lang, words in CASES:
        t0 = time.monotonic()
        first = await library_search.search(query=words, lang=lang, requested=["islamhouse"], lib_type=None, page_size=12, cursor=None)
        ms1 = int((time.monotonic() - t0) * 1000)
        more = None
        if first["next_cursor"]:
            t1 = time.monotonic()
            more = await library_search.search(
                query=words, lang=lang, requested=["islamhouse"], lib_type=None, page_size=12, cursor=first["next_cursor"]
            )
            ms2 = int((time.monotonic() - t1) * 1000)
        ids = [i["id"] for i in first["items"] + (more["items"] if more else [])]
        row = {
            "lang": lang,
            "query": words,
            "status": first["status"],
            "source_status": first["source_status"],
            "page1_items": len(first["items"]),
            "page1_ms": ms1,
            "page2_items": len(more["items"]) if more else None,
            "page2_ms": ms2 if more else None,
            "duplicates": len(ids) - len(set(ids)),
            "sample": [{k: i[k] for k in ("title", "type", "url")} for i in first["items"][:3]],
        }
        RESULTS.append(row)
        print(json.dumps(row, ensure_ascii=False))
        assert first["status"] in ("success", "partial")
        assert row["duplicates"] == 0
        assert all(i["url"].startswith("https://islamhouse.com/") and i["lang"] == lang for i in first["items"])
        await asyncio.sleep(1.5)
    out = os.environ.get("RAFEEQ_LIVE_SMOKE_OUT")
    if out:
        Path(out).write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1), encoding="utf-8")  # noqa: ASYNC240
    assert any(r["page1_items"] for r in RESULTS)
