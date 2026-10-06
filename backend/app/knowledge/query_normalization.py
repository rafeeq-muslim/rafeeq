"""KNW-01 reliability R2: a search-only form of the question.

`textcheck.normalize` is shared by the safety screens and the quote checks,
so it is not changed. This module builds, for retrieval and the embedding
cache only:

- `raw`: the question as asked (shown, routed, composed from; never stored);
- `canonical`: Unicode NFKC, Arabic diacritics and tatweel removed,
  punctuation (Arabic and Latin) turned into spaces, spaces collapsed, and
  a short reviewed list of glued question openers split at the START of
  the question only («مامعنى» → «ما معنى»). Letters are not folded (the
  full-text index does its own folding) and no word is dropped, so
  negation (لا، ليس، not), names, numbers and personal details stay;
- `variants`: at most one extra form for the single expansion round (the
  content words without the leading question words), or none.

`VERSION` is part of the embedding cache key: changing a rule changes the
version, which retires every cached vector made under the old rules.
"""

import re
import unicodedata
from dataclasses import dataclass, field

from app.core.config import get_settings
from app.knowledge.ai.textcheck import _AR_PUNCT, _DIACRITICS

VERSION = "qn1"

_PUNCT = re.compile(r"[^\w\u0600-\u06FF\s']")
_SPACES = re.compile(r"\s+")

# Reviewed list: tokens that are never a word of their own, only a glued
# «ما» + noun/pronoun. Applied to the FIRST token only. «مالك» (Malik / your
# property / what is wrong with you), «ماهر», «مازال», «ماذا» are not here
# and never change.
GLUED_OPENERS = {
    "مامعنى": "ما معنى",
    "ماهو": "ما هو",
    "ماهي": "ما هي",
    "ماحكم": "ما حكم",
}

# Leading question words dropped in the expansion variant only (never in canonical).
_LEADING = {
    "ar": ("ما معنى", "ما هو", "ما هي", "ما حكم", "ماذا", "ما", "هل", "كيف", "لماذا", "متى", "اين", "أين"),
    "en": ("what does", "what is", "what are", "what", "how do i", "how do", "how", "why", "when", "is it", "can i"),
    "tl": ("ano ang", "ano", "paano", "bakit", "kailan"),
}


@dataclass
class QueryForms:
    raw: str
    canonical: str
    version: str  # VERSION, or "off" when normalization is disabled
    variants: list[str] = field(default_factory=list)


def canonical(text: str) -> str:
    t = unicodedata.normalize("NFKC", text)
    t = _DIACRITICS.sub("", t)
    t = _AR_PUNCT.sub(" ", t)
    t = _PUNCT.sub(" ", t)
    t = _SPACES.sub(" ", t).strip()
    if not t:
        return t
    first, _, rest = t.partition(" ")
    if first in GLUED_OPENERS:
        t = f"{GLUED_OPENERS[first]} {rest}".strip()
    return t


def expansion_variant(canon: str, lang: str) -> str | None:
    """The content words of the canonical form, without its leading question words."""
    low = canon.lower()
    for lead in _LEADING.get(lang, ()):
        if low.startswith(lead + " "):
            rest = canon[len(lead) :].strip()
            return rest if len(rest) >= 2 and rest != canon else None
    return None


def build(question: str, lang: str) -> QueryForms:
    raw = question.strip()
    if not get_settings().ask_query_normalization_enabled:
        return QueryForms(raw=raw, canonical=raw, version="off")
    canon = canonical(raw) or raw
    variant = expansion_variant(canon, lang)
    return QueryForms(raw=raw, canonical=canon, version=VERSION, variants=[variant] if variant else [])
