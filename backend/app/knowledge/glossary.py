"""KNW-03: the unified glossary (approved term service only).

KNW-03 «خارج النطاق» excludes a dictionary that learners browse or search,
so there is no learner screen: lessons and the assistant read approved terms
through `approved_terms()` or `GET /api/glossary`.

Terms are written in `content/glossary/terms.json`:
  {"terms": [{"concept": "الوضوء", "langs": {"tl": {"term", "alternates", "definition", "source_ids"}}}]}
Each concept is one KNW-05 review item (`glossary_term`); a language is used
only once the Sharia reviewer approves it (R2). The file may not give a
concept two terms in one language (R1). `alternates` are the known other
spellings (plan §8.1): never used by the assistant, flagged in team text.

R3: the composer and the explainer get the approved terms (`prompt_block`);
a team text with a non-approved spelling is flagged (`spelling_flags`, in the
review desk and content/check_content.py). R5: a concept with no approved
term in a language is recorded for the reviewer (`record_gaps`).
"""

import json
import re
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.knowledge import review
from app.knowledge.ai.textcheck import has_arabic, normalize
from app.knowledge.models import GlossaryTerm
from app.knowledge.review import ReviewItem

ITEM_TYPE = "glossary_term"
LANGS = ("ar", "en", "tl")
MISSING = "missing"  # knw_glossary.status of a concept with no approved term in a language (R5)


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


# --- R3: the assistant and the explainer write the approved term ----------------


async def prompt_terms(session: AsyncSession, lang: str) -> list[dict]:
    """Approved terms for a model prompt; no query while the file is empty."""
    return await approved_terms(session, lang) if load() else []


def prompt_block(terms: list[dict]) -> str:
    """The GLOSSARY section of a composer or explainer input ("" when empty,
    so the input is exactly as before until terms are approved)."""
    if not terms:
        return ""
    lines = []
    for t in terms:
        other = [a for a in t.get("alternates") or [] if a and a != t["term"]]
        lines.append(f"- {t['concept']}: {t['term']}" + (f" (not: {', '.join(other)})" if other else ""))
    return "\n\nGLOSSARY (approved term in LANGUAGE for each concept):\n" + "\n".join(lines)


def _found(norm_text: str, spelling: str) -> bool:
    s = normalize(spelling)
    if not s:
        return False
    if has_arabic(s):
        # Arabic attaches prefixes (و، ب، ال): match the stem without its article.
        stem = s[2:] if s.startswith("ال") and len(s) > 4 else s
        return stem in norm_text
    return re.search(rf"(?<![\w']){re.escape(s)}(?![\w'])", norm_text) is not None


def spelling_flags(text: str, lang: str, terms: list[dict] | None = None) -> list[dict]:
    """R3 ex2: concepts in `text` written with a spelling the glossary lists as
    not approved (`alternates`) in `lang`, for the reviewer to see."""
    out = []
    for t in load() if terms is None else terms:
        v = (t.get("langs") or {}).get(lang)
        if not v or not v.get("term"):
            continue
        # the approved term itself never counts (an alternate may be part of it)
        norm = normalize(text).replace(normalize(v["term"]), " ")
        for alt in v.get("alternates") or []:
            if normalize(alt) != normalize(v["term"]) and _found(norm, alt):
                out.append({"concept": t["concept"], "found": alt, "term": v["term"]})
    return out


def _spellings(t: dict) -> list[str]:
    out = [t["concept"]]
    for v in (t.get("langs") or {}).values():
        out += [v.get("term") or "", *(v.get("alternates") or [])]
    return [s for s in out if s]


async def record_gaps(session: AsyncSession, lang: str, texts: list[str]) -> list[str]:
    """R5: a listed concept that appears in an answer (or its passages) in a
    language with no approved term is recorded once, for the Sharia reviewer
    (`knw_glossary` row, status `missing`: the concept and language only,
    never the question). The answer keeps the passage's wording."""
    terms = load()
    if not terms:
        return []
    have = {t["concept"] for t in await approved_terms(session, lang)}
    norm = normalize(" ".join(texts))
    missing = [t["concept"] for t in terms if t["concept"] not in have and any(_found(norm, s) for s in _spellings(t))]
    if missing:
        async with SessionLocal() as s:
            known = set(
                await s.scalars(
                    select(GlossaryTerm.concept).where(
                        GlossaryTerm.lang == lang, GlossaryTerm.status == MISSING, GlossaryTerm.concept.in_(missing)
                    )
                )
            )
            for c in missing:
                if c not in known:
                    s.add(GlossaryTerm(concept=c[:64], lang=lang, term="", status=MISSING))
            await s.commit()
    return missing


async def missing_terms(session: AsyncSession) -> list[dict]:
    """R5 review list: concepts still without an approved term in a language."""
    rows = list(await session.scalars(select(GlossaryTerm).where(GlossaryTerm.status == MISSING).order_by(GlossaryTerm.concept)))
    out = []
    for r in rows:
        if r.concept not in {t["concept"] for t in await approved_terms(session, r.lang)}:
            out.append({"concept": r.concept, "lang": r.lang})
    return out
