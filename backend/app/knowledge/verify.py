"""KNW-01 plan §4.6: checks before an answer is shown (rules.md §2.3: verify
every reference against the retrieved set; §1.3: drop an answer citing what
was not retrieved). No failing answer is ever shown.

KNW-01 reliability §14.1: the result is typed. `rejected` (a content problem
with its codes) is kept apart from `unavailable` (the checker could not
run), which is never read as "no source".

Code checks (no model):
  1 the output matches the contract (done by the client: retried once)
  2 every id in `sources` and every {{q:ID}} marker was retrieved this turn
  3 `sufficient` is not false
  4 no Arabic letters outside markers in an answer that is not Arabic (ﷺ allowed)
  5 no quoted span longer than KNW_QUOTE_MAX_WORDS outside markers
  6 the answer is in the asker's language
  7 Arabic answers: no run of KNW_SCRIPTURE_OVERLAP_WORDS words copied from a
    retrieved Quran or hadith passage outside markers
  8 no web address, e-mail, account name (@name) or HTML/Markdown markup
    outside markers (security review 2026-10-07, B-L1)
Then a fast-model support check: every sentence is supported by the cited
passages. If the checker cannot run, the answer is not shown (fail closed).
"""

import re
from dataclasses import dataclass, field
from typing import Any

from app.core.config import get_settings
from app.knowledge.ai import agents
from app.knowledge.ai.client import AiUnavailable
from app.knowledge.ai.textcheck import (
    MARKER,
    has_arabic,
    language_matches,
    link_or_markup,
    longest_quote_words,
    ngram_overlap,
    strip_markers,
)

SCRIPTURE_KINDS = ("quran_arabic", "quran_translation", "quran_tafsir", "hadith")
# Codes that mean "the passages do not answer it" rather than a content violation.
INSUFFICIENT_CODES = {"insufficient", "empty", "no_citation"}


@dataclass
class VerificationResult:
    status: str  # passed | rejected | unavailable
    codes: list[str] = field(default_factory=list)
    unsupported: list[str] = field(default_factory=list)  # verifier quotes, used only for the one repair
    error: AiUnavailable | None = None  # why the checker could not run (status unavailable)

    @property
    def passed(self) -> bool:
        return self.status == "passed"

    @property
    def insufficient_only(self) -> bool:
        """Rejected only because the passages were judged not enough (§14.1 rule 6)."""
        return self.status == "rejected" and "insufficient" in self.codes and set(self.codes) <= INSUFFICIENT_CODES


def cited_ids(out: dict[str, Any]) -> list[str]:
    """Marker ids in order of appearance, then the remaining `sources`."""
    ids = MARKER.findall(out.get("answer") or "")
    return list(dict.fromkeys([*ids, *out.get("sources", [])]))


def code_checks(out: dict[str, Any], lang: str, retrieved: dict[str, dict[str, Any]]) -> list[str]:
    st = get_settings()
    answer = out.get("answer") or ""
    body = strip_markers(answer)
    fails: list[str] = []
    if out.get("sufficient") is False:
        fails.append("insufficient")  # 3
    if not body.strip():
        fails.append("empty")
    ids = cited_ids(out)
    if not ids:
        fails.append("no_citation")
    if "{{" in body or "}}" in body:
        fails.append("malformed_marker")  # e.g. {{binbaz:ar:1}} without "q:": never shown as text
    if any(i not in retrieved for i in ids):
        fails.append("unretrieved_reference")  # 2
    if lang != "ar" and has_arabic(body):
        fails.append("arabic_in_non_arabic_answer")  # 4
    if longest_quote_words(body) > st.knw_quote_max_words:
        fails.append("long_quote_outside_marker")  # 5
    if body.strip() and not language_matches(answer, lang):
        fails.append("wrong_language")  # 6
    if link_or_markup(body):
        fails.append("link_or_markup_in_answer")  # 8
    # 7: in every language (security review #10): a translation of a verse or
    # hadith pasted as the model's own words is copying too.
    for p in retrieved.values():
        if p["kind"] in SCRIPTURE_KINDS and ngram_overlap(body, p["quote_text"], st.knw_scripture_overlap_words):
            fails.append("scripture_copied_outside_marker")
            break
    return fails


_SENTENCE_END = re.compile(r"(?<=[.!?؟。])\s+|\n+")


def copied_sentences(out: dict[str, Any], retrieved: dict[str, dict[str, Any]]) -> list[str]:
    """KNW-01 answer rate: the sentences that repeat scripture words (check 7),
    handed to the one repair as sentences to remove or reword. Before this
    the repair only heard "the answer repeated words of a verse or hadith"
    and often repeated the same sentence (prod 2026-10-06, ask 5d062ba5)."""
    st = get_settings()
    scripture = [p["quote_text"] for p in retrieved.values() if p["kind"] in SCRIPTURE_KINDS]
    found = []
    for s in _SENTENCE_END.split(out.get("answer") or ""):
        body = strip_markers(s)
        if body.strip() and any(ngram_overlap(body, q, st.knw_scripture_overlap_words) for q in scripture):
            found.append(s.strip()[:300])
    return found[:6]


async def verify(out: dict[str, Any], lang: str, retrieved: dict[str, dict[str, Any]]) -> VerificationResult:
    """Code checks, then the model support check (main model, then fallback,
    inside the request budget). Fails closed: nothing is shown unless passed."""
    fails = code_checks(out, lang, retrieved)
    if fails:
        copied = copied_sentences(out, retrieved) if "scripture_copied_outside_marker" in fails else []
        return VerificationResult("rejected", fails, copied)
    cited = [agents.passage_block(retrieved[i]) for i in cited_ids(out)]
    try:
        r = await agents.support_check("verifier", out["answer"], cited)
    except AiUnavailable as e:
        return VerificationResult("unavailable", ["verifier_unavailable"], error=e)
    if r["supported"]:
        return VerificationResult("passed")
    return VerificationResult("rejected", ["unsupported_sentence"], [str(u)[:300] for u in r["unsupported"]][:6])
