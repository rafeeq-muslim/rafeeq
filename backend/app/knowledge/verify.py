"""KNW-01 plan §4.6: checks before an answer is shown. Any failure means the
answer is treated as having no source (rules.md §2.3: verify every reference
against the retrieved set; §1.3: drop an answer citing what was not
retrieved).

Code checks (no model):
  1 the output matches the contract (done by the client: retried once)
  2 every id in `sources` and every {{q:ID}} marker was retrieved this turn
  3 `sufficient` is not false
  4 no Arabic letters outside markers in an answer that is not Arabic (ﷺ allowed)
  5 no quoted span longer than KNW_QUOTE_MAX_WORDS outside markers
  6 the answer is in the asker's language
  7 Arabic answers: no run of KNW_SCRIPTURE_OVERLAP_WORDS words copied from a
    retrieved Quran or hadith passage outside markers
Then a fast-model support check: every sentence is supported by the cited
passages. If the checker cannot run, the answer is not shown (fail closed).
"""

from typing import Any

from app.core.config import get_settings
from app.knowledge.ai import agents
from app.knowledge.ai.client import AiUnavailable
from app.knowledge.ai.textcheck import MARKER, has_arabic, language_matches, longest_quote_words, ngram_overlap, strip_markers

SCRIPTURE_KINDS = ("quran_arabic", "quran_translation", "quran_tafsir", "hadith")


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
    if lang == "ar":  # 7
        for p in retrieved.values():
            if p["kind"] in SCRIPTURE_KINDS and ngram_overlap(body, p["quote_text"], st.knw_scripture_overlap_words):
                fails.append("scripture_copied_outside_marker")
                break
    return fails


async def verify(out: dict[str, Any], lang: str, retrieved: dict[str, dict[str, Any]]) -> list[str]:
    fails = code_checks(out, lang, retrieved)
    if fails:
        return fails
    cited = [agents.passage_block(retrieved[i]) for i in cited_ids(out)]
    try:
        r = await agents.support_check("verifier", out["answer"], cited)
    except AiUnavailable:
        return ["verifier_unavailable"]
    return [] if r["supported"] else ["unsupported_sentence"]
