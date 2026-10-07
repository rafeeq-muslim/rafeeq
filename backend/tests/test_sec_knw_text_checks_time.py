"""Security review 2026-10-07 (asked with B-M5; not covered by the audit): the
text checks of the assistant run on the event loop, on a question a stranger
typed (600 characters at most) and on model output (900 tokens at most), so
none of them may be slower than linear. Each is timed on adversarial input at
well over its longest real length, at two lengths.

Found and fixed: `quoted_spans` (unclosed quotation marks, quadratic). Linear
but with a large constant, left as it is: the copy check on a text made only
of «ﷺ», which normalisation writes out as four words."""

import gc
import random
import re
import time

import pytest

from app.knowledge import approved
from app.knowledge.ai import screen, textcheck

QUESTION = 600  # AskIn.question max_length
ANSWER = 8000  # more than 900 tokens of any script
BUDGET_S = 0.050

UNITS = [
    "a", " ", "\n", '"', "“", "«", "﴿", "„", '"a', "“a", "«a ", "{{", "{{q:", "{{q: a, ", "}}", "{", "q:", "q : ", " ,", ";",
    "<", "<a", "<a ", "[", "[a", "](", "![", "&", "&a", "&#", "@", "a@", ".", "a.", "a.b", ".com", "/", "a/", "http", "http:",
    "www.", "he ", "he said", "said ", "said :", "ibn ", "abu a ", "قال ", "قال", "ال", "ي ", "a-", "al-", "ar-", "'", "a'",
    "1", "1:", "ـ", "ً", "؟", "ﷺ",
]  # fmt: skip


def shapes(n: int) -> dict[str, str]:
    out = {repr(u): (u * n)[:n] for u in UNITS}
    out.update({repr(u) + "+end": (u * n)[: n - 1] + "!" for u in UNITS})
    rng = random.Random(20261007)
    for i in range(40):
        out[f"mix-{i}"] = "".join(rng.choice(UNITS) for _ in range(n))[:n]
    return out


ANSWER_CHECKS = {
    "normalize": textcheck.normalize,
    "words": textcheck.words,
    "strip_markers": textcheck.strip_markers,
    "fix_markers": lambda t: textcheck.fix_markers(t, {"hadeethenc:en:1"}),
    "has_arabic": textcheck.has_arabic,
    "longest_quote_words": textcheck.longest_quote_words,
    "link_or_markup": textcheck.link_or_markup,
    "language_en": lambda t: textcheck.language_matches(t, "en"),
    "language_ar": lambda t: textcheck.language_matches(t, "ar"),
    "language_tl": lambda t: textcheck.language_matches(t, "tl"),
    "ngram_overlap": lambda t: textcheck.ngram_overlap(t, t[: len(t) // 2], 6),
    "attribution": textcheck.ATTRIBUTION.search,
    "transliteration": textcheck.TRANSLIT.search,
}
QUESTION_CHECKS = {
    "is_danger": screen.is_danger,
    "is_manipulation": screen.is_manipulation,
    "is_learning_guide": screen.is_learning_guide,
    "approved_exact": lambda t: approved.matches(t, "how do i make wudu before the prayer", exact_only=True),
    "approved_near": lambda t: approved.matches(t, "how do i make wudu before the prayer", exact_only=False),
}


def seconds(fn, text: str, enough: float = 0.0) -> float:
    """The best CPU time of this thread over up to twelve runs (it stops as
    soon as one run is under `enough`), with the garbage collector held. A
    slow pattern is slow every time; a busy test machine or a collection of
    the test process's large heap is not."""
    best = 10.0
    gc.disable()
    try:
        for _ in range(12):
            t = time.thread_time()
            fn(text)
            best = min(best, time.thread_time() - t)
            if best < enough:
                break
    finally:
        gc.enable()
    return best


def superlinear(fn, n: int) -> dict[str, tuple[float, float]]:
    """Shapes on which four times the text costs far more than four times the
    time (a quadratic check costs sixteen). Anything under 5 ms at full length
    is too fast to matter and too small to measure."""
    out = {}
    short = shapes(n // 4)
    for name, text in shapes(n).items():
        if seconds(fn, text, enough=0.005) < 0.005:
            continue
        short_s = max(seconds(fn, short[name], enough=0.0002), 1e-5)
        long_s = seconds(fn, text, enough=9 * short_s)
        if long_s > 9 * short_s:
            out[name] = (round(short_s, 4), round(long_s, 4))
    return out


@pytest.mark.parametrize("name", list(ANSWER_CHECKS))
def test_sec_answer_checks_are_linear_on_adversarial_model_output(name):
    assert superlinear(ANSWER_CHECKS[name], ANSWER) == {}


def test_sec_unclosed_quotes_were_the_slow_case():
    """`quoted_spans` was slower than linear on marks that are never closed."""
    for mark in ('"', "“", "«", "﴿", "„"):
        assert seconds(textcheck.quoted_spans, mark * ANSWER, enough=BUDGET_S) < BUDGET_S
        assert seconds(textcheck.quoted_spans, (mark + "a ") * (ANSWER // 3), enough=BUDGET_S) < BUDGET_S


OLD_QUOTES = re.compile(r"\"([^\"]+)\"|“([^”]+)”|«([^»]+)»|﴿([^﴾]+)﴾|„([^“]+)“")


def test_sec_quoted_spans_finds_exactly_what_the_old_pattern_found():
    rng = random.Random(7)
    pieces = ['"', "“", "”", "«", "»", "﴿", "﴾", "„", "a", "b c", " ", "\n", "قال", ""]
    for _ in range(20000):
        text = "".join(rng.choice(pieces) for _ in range(rng.randint(0, 14)))
        old = [next(g for g in m.groups() if g) for m in OLD_QUOTES.finditer(text)]
        assert textcheck.quoted_spans(text) == old, repr(text)


@pytest.mark.parametrize("name", list(QUESTION_CHECKS))
def test_sec_question_checks_are_linear_on_an_adversarial_question(name):
    assert superlinear(QUESTION_CHECKS[name], QUESTION * 4) == {}
