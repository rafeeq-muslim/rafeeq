"""CMP-01 R5, security review 2026-10-07 (H1): the contact filter must run in
linear time. One guest message used to freeze the whole API: a spelled-out
address followed by double-spaced «dot label» groups backtracked exponentially
(94 characters took 7.5 s), on the event loop of the only worker."""

import time

import pytest

from app.companion.text import MAX_BODY, contact_violation

BUDGET_S = 0.05

UNITS = [
    "1.", "a.", "a-", "a@", "a at ", "a dot ", "snap ", "tg: ", "@a", " at ", " dot ", "(at)", "( dot )",
    "a.b", "-", "_", "%", "a. ", "1-", "1 ", "+1(", "www.", "t.me/", "a.co", "x at y dot ", "a at b dot c dot ",
    "telegram  ", "\n", "a\t",
]  # fmt: skip


def adversarial() -> list[str]:
    shapes = [
        # the two shapes measured in the review
        *("name at gmail" + "  dot  abc" * n for n in (8, 10, 12, 16, 40, 190)),
        *("word" + " " * n + "at" + " " * n + "word" + " " * n + "dot" for n in (100, 200, 600)),
        *((unit * MAX_BODY)[:MAX_BODY] for unit in UNITS),
        *((start + " " * MAX_BODY)[:MAX_BODY] for start in ("snap", "name at gmail", "x@y", "a")),
    ]
    return [s[:MAX_BODY] for s in shapes]


@pytest.mark.parametrize("body", adversarial(), ids=lambda b: f"{b[:18]!r}x{len(b)}")
def test_cmp01_r5_contact_filter_finishes_within_budget(body: str) -> None:
    start = time.perf_counter()
    contact_violation(body)
    assert time.perf_counter() - start < BUDGET_S


def test_cmp01_r5_text_past_the_cap_is_never_matched() -> None:
    # The cap holds inside the filter itself, whatever the caller checked.
    start = time.perf_counter()
    assert contact_violation("a" * MAX_BODY + " name@example.com") is None
    assert contact_violation("x " * 500_000) is None
    assert time.perf_counter() - start < BUDGET_S * 4


@pytest.mark.parametrize(
    ("body", "kind"),
    [
        ("name at gmail dot com", "email"),
        ("name  (at)  mail [dot] org", "email"),
        ("name @ gmail . com", "email"),
        ("write me: layla at yahoo", "email"),
        ("name\n@\ngmail\n.\ncom", "email"),
        ("name at mail dot example dot co dot uk", "email"),
        ("foo..example.com", "link"),
        ("see sub.example.com today", "link"),
        ("snap:   layla_99", "handle"),
        ("telegram   @layla", "handle"),
    ],
)
def test_cmp01_r5_spelled_contacts_are_still_refused(body: str, kind: str) -> None:
    assert contact_violation(body) == kind


@pytest.mark.parametrize(
    "body",
    ["call me at home dot", "I was at the mosque. Then I left", "البقرة 255-257", "2:255", "1447/03/20", "a telegram group"],
)
def test_cmp01_r5_ordinary_text_still_passes(body: str) -> None:
    assert contact_violation(body) is None
