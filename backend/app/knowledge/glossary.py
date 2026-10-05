"""KNW-03: the unified glossary (approved term service only).

KNW-03 «خارج النطاق» excludes a dictionary that learners browse or search,
so there is no learner screen: lessons and the assistant read approved terms
through `approved_terms()` or `GET /api/glossary`.

Terms are written in `content/glossary/terms.json`:
  {"terms": [{"concept": "الوضوء", "langs": {"tl": {"term", "alternates", "definition", "source_ids"}}}]}
Each concept is one KNW-05 review item (`glossary_term`); a language is used
only once the Sharia reviewer approves it (R2). The file may not give a
concept two terms in one language (R1).
"""

import json
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.knowledge import review
from app.knowledge.review import ReviewItem

ITEM_TYPE = "glossary_term"
LANGS = ("ar", "en", "tl")


class DuplicateTerm(ValueError):
    """R1: one approved term per concept per language."""


def terms_file() -> Path:
    return get_settings().content_dir / "glossary" / "terms.json"


def validate(terms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    for t in terms:
        if t["concept"] in seen:
            raise DuplicateTerm(t["concept"])
        seen.add(t["concept"])
        for lg, v in t.get("langs", {}).items():
            if lg not in LANGS:
                raise ValueError(f"unknown language {lg}")
            if not isinstance(v, dict) or isinstance(v.get("term"), list):
                raise DuplicateTerm(f"{t['concept']}:{lg}")
    return terms


@lru_cache
def load() -> list[dict[str, Any]]:
    f = terms_file()
    if not f.exists():
        return []
    return validate(json.loads(f.read_text(encoding="utf-8")).get("terms", []))


def term_view(t: dict, lang: str) -> dict:
    v = t["langs"][lang]
    return {
        "concept": t["concept"],
        "term": v["term"],
        "alternates": v.get("alternates", []),
        "definition": v.get("definition", ""),
        "source_ids": v.get("source_ids", []),
    }


def _review_items() -> Iterable[ReviewItem]:
    for i, t in enumerate(load()):
        yield ReviewItem(
            ITEM_TYPE,
            t["concept"],
            order=(i,),
            group="glossary",
            views={lg: term_view(t, lg) for lg in LANGS if lg in t.get("langs", {})},
        )


review.register(ITEM_TYPE, _review_items)


async def approved_terms(session: AsyncSession, lang: str) -> list[dict]:
    """Approved terms in one language; nothing for a language without approval (R5)."""
    live = await review.published(session, ITEM_TYPE, lang)
    return [live[t["concept"]] for t in load() if t["concept"] in live]
