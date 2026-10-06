"""islamqa.info, read live (PRD live v3 §4).

Endpoints: the site's own JSON API, the one its web search uses (found in
its Next.js client, served from https://islamqa.info itself; robots.txt
disallows only /_next/). No key. Checked from this backend on 2026-10-06:

  search  GET https://islamqa.info/api/search?lang={ar|en}&limit=N&searchType=answer&query=...
          -> {"Search": {"results": [{"id", "reference", "title", "question" (HTML), "show_date"}]}, ...}
  fetch   GET https://islamqa.info/api/posts/answer/{reference}?relations=1&content_metadata=1&lang={lang}
          -> {"reference", "lang", "title", "question" (HTML), "body" (HTML), "description" (HTML),
              "source": {"title"}, "updatedAt", ...}

Canonical page: https://islamqa.info/{lang}/answers/{reference}. Languages
used here: ar, en (the site has no Tagalog).

⚠️ Licence: the Terms of Use allow personal, non-commercial use; Rafeeq's
use is an owner decision (2026-10-05) with the permission request still to
send (docs/agents/sources.md)."""

import re

from app.knowledge.live_sources import http
from app.knowledge.live_sources import types as T
from app.knowledge.live_sources.registry import Call, Record
from app.knowledge.sources._common import strip_html

SEARCH = "https://islamqa.info/api/search"
DETAIL = "https://islamqa.info/api/posts/answer/{ref}"
_REF = re.compile(r"^\d{1,9}$")


def parse_search(data: object, lang: str, limit: int) -> list[T.Candidate]:
    try:
        rows = data["Search"]["results"]  # type: ignore[index]
    except (KeyError, TypeError):
        raise http.FetchError(T.BAD_RESPONSE) from None
    out: list[T.Candidate] = []
    for row in rows if isinstance(rows, list) else []:
        ref = str((row or {}).get("reference") or "")
        if not _REF.match(ref) or any(c.external_id == ref for c in out):
            continue
        out.append(
            T.Candidate(
                "islamqa",
                ref,
                lang,
                strip_html(str(row.get("title") or "")),
                len(out) + 1,
                snippet=strip_html(str(row.get("question") or ""))[:300],
            )
        )
        if len(out) >= limit:
            break
    return out


def parse_detail(data: object, ref: str, lang: str) -> Record:
    if not isinstance(data, dict) or str(data.get("reference")) != ref or (data.get("lang") or lang) != lang:
        raise http.FetchError(T.BAD_RESPONSE)  # not the record we asked for
    src = data.get("source") if isinstance(data.get("source"), dict) else {}
    return Record(
        external_id=ref,
        canonical_url=f"https://islamqa.info/{lang}/answers/{ref}",
        lang=lang,
        title=strip_html(str(data.get("title") or "")),
        body=strip_html(str(data.get("body") or "")),
        question=strip_html(str(data.get("question") or "")),
        summary=strip_html(str(data.get("description") or "")),
        attribution=strip_html(str(src.get("title") or "")) or None,
        kind="fatwa",
    )


async def search(call: Call, terms: str, lang: str, limit: int) -> list[T.Candidate]:
    data = await call.get_json(SEARCH, {"lang": lang, "limit": str(max(limit, 5)), "searchType": "answer", "query": terms})
    return parse_search(data, lang, limit)


async def fetch(call: Call, cand: T.Candidate) -> Record:
    data = await call.get_json(DETAIL.format(ref=cand.external_id), {"relations": "1", "content_metadata": "1", "lang": cand.lang})
    return parse_detail(data, cand.external_id, cand.lang)
