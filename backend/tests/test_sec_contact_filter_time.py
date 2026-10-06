"""Security review 2026-10-07, A-H1 / B-M5: the contact filter (CMP-01 R5) is
linear in the message length and never runs on the event loop.

Before the fix a guest's message of about 100 characters kept the only
server process busy for more than 20 seconds (nested whitespace quantifiers in
the spelled-out e-mail patterns), and «a.a.a.…» was quadratic."""

import asyncio
import random
import time

import pytest
from fastapi import HTTPException

from app.companion import text
from app.companion.text import MAX_BODY, clean_body_async, contact_violation

BUDGET_S = 0.050


def _fit(unit: str, prefix: str = "", suffix: str = "") -> str:
    room = MAX_BODY - len(prefix) - len(suffix)
    return (prefix + unit * (room // len(unit)) + suffix)[:MAX_BODY]


# The two shapes measured in the review, at the longest accepted length.
REVIEW_SHAPES = {
    # a spelled-out address, then double-spaced «dot + label» groups that never end in a TLD
    "dot-groups": _fit("  dot  ab", prefix="name at mail"),
    "dot-groups-mixed": _fit("  dot  ab  .  ab ( dot ) ab", prefix="name  at  mail"),
    # word, n spaces, at, n spaces, word, n spaces, dot
    "spaces-around-at": "word" + " " * 660 + "at" + " " * 660 + "word" + " " * 660 + "dot",
    "spaces-around-at-tabs": "word" + "\t \n" * 220 + "at" + " \t" * 330 + "word" + " " * 660 + "dot",
}

UNITS = [
    "1.", "a.", "a-", "a", "1", " ", "@", "a@", "a@a.", ". ", "a .", " at ", "at ", " dot ", "dot ", "a at a dot ",
    "a  dot  ", "snap ", "ig ", "ig", "snap\t", "-", "_", "a_", "1 ", "1-", "(1)", "+1", "00", "1:", "1/", "www.",
    ".com", "com.", "a.com_", "a.co", "(at)", "( at )", "[dot]", "( dot )", "x (at) x (dot) ", "gmail ", "wa",
    "whats ", "واتس ", "سناب ", "٠", "a%", "a+", "\n", "a\n", "1\n", ".", "..", "a..", "-.", "a-.", "is ",
    "ig is ", "ig id ", "ig:", "ig :", "ig  id  :  ",
]  # fmt: skip
PREFIXES = ["", "name at mail", "name@", "snap", "name (at) "]


def _shapes() -> dict[str, str]:
    out = dict(REVIEW_SHAPES)
    for unit in UNITS:
        for prefix in PREFIXES:
            out[f"{prefix!r}+{unit!r}"] = _fit(unit, prefix=prefix)
        out[f"{unit!r}+end"] = _fit(unit, suffix="!")
    rng = random.Random(20261007)
    for i in range(60):  # random mixtures of the same pieces
        out[f"mix-{i}"] = "".join(rng.choice(UNITS) for _ in range(MAX_BODY))[:MAX_BODY]
    return out


def _seconds(body: str) -> float:
    best = 10.0
    for _ in range(3):  # the best of three: a busy test machine is not a slow pattern
        t = time.perf_counter()
        contact_violation(body)
        best = min(best, time.perf_counter() - t)
        if best < BUDGET_S:
            break
    return best


@pytest.mark.parametrize("name", list(REVIEW_SHAPES))
def test_sec_a_h1_review_shapes_finish_within_budget(name):
    body = REVIEW_SHAPES[name]
    assert MAX_BODY - 100 < len(body) <= MAX_BODY
    assert _seconds(body) < BUDGET_S


def test_sec_a_h1_no_message_of_the_longest_length_is_slow():
    contact_violation("warm up: name at mail dot com, snap: a_b")
    slow = {name: round(s, 3) for name, body in _shapes().items() if (s := _seconds(body)) >= BUDGET_S}
    assert slow == {}


def test_sec_a_h1_time_grows_with_the_length_not_its_square():
    """Ten times the text may take about ten times as long, never a hundred."""
    for name, body in REVIEW_SHAPES.items():
        short, long = body[: MAX_BODY // 10], body
        ratio = _seconds(long) / max(_seconds(short), 20e-6)
        assert ratio < 40, name


@pytest.mark.parametrize(
    "kind,body",
    [
        # the rewritten patterns still see through spacing and line breaks
        ("email", "name   at   mail   dot   com"),
        ("email", "name\nat\nmail\ndot\ncom"),
        ("email", "name ( at ) mail [ dot ] co { dot } uk"),
        ("email", "name  @  mail . example . org"),
        ("email", "write   to name   at   gmail"),
        ("link", "a..example.com"),
        ("link", "see sub.domain.example.org now"),
        ("handle", "snap   :   layla_k"),
        ("handle", "واتس   اب   layla_99"),
        ("handle", "my insta\nis\nlayla.k"),
    ],
)
def test_sec_a_h1_spacing_does_not_hide_a_contact(kind, body):
    assert contact_violation(body) == kind


@pytest.mark.parametrize("body", ["verses 255\n256\n257", "my_file.com is not read as a link today", "1\n2\n3\n4\n5\n6\n7\n8"])
def test_sec_a_h1_collapsing_spaces_adds_no_false_alarm(body):
    assert contact_violation(body) is None


async def test_sec_b_m5_the_scan_runs_off_the_event_loop(monkeypatch):
    """A scan that takes long (here: 0.3 s on purpose) leaves the loop free."""

    def slow(body: str) -> None:
        time.sleep(0.3)

    monkeypatch.setattr(text, "contact_violation", slow)
    ticks = 0

    async def other_requests() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    task = asyncio.create_task(other_requests())
    assert await clean_body_async("السلام عليكم") == "السلام عليكم"
    task.cancel()
    assert ticks >= 10  # on the loop this would be 0


async def test_sec_b_m5_a_scan_that_does_not_finish_refuses_the_message(monkeypatch):
    monkeypatch.setattr(text, "CHECK_TIMEOUT_S", 0.05)
    monkeypatch.setattr(text, "contact_violation", lambda body: time.sleep(0.3))
    with pytest.raises(HTTPException) as e:
        await clean_body_async("hello")
    assert e.value.status_code == 422 and e.value.detail == "message_not_checked"


async def test_sec_a_h1_a_guest_message_of_the_review_shape_is_answered_at_once(client):
    t = time.perf_counter()
    r = await client.post("/api/help/requests", json={"lang": "en", "gender": "f", "body": REVIEW_SHAPES["dot-groups"]})
    assert r.status_code == 201, r.text
    assert time.perf_counter() - t < 2
