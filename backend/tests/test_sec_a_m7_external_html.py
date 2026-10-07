"""Security review 2026-10-07, A-M7: text and pages fetched from other sites
are handled in time linear in their size: tags are stripped in one pass
(same output as before, byte for byte), a page parsed as HTML is at most
500 KB, and pages are parsed off the event loop."""

import html
import random
import re
import threading
import time

import httpx
import pytest

from app.knowledge.live_sources import binbaz, http, islamic_content
from app.knowledge.live_sources import types as T
from app.knowledge.sources._common import strip_html

N = 500_000
BUDGET_MS = 200

_TAG = re.compile(r"<[^>]+>")
_BLOCK = re.compile(r"(?i)<\s*(br|/p|/div|/li|/h[1-6]|/blockquote|/tr)\s*/?>")


def strip_html_before(s: str) -> str:
    """The implementation this review replaced, kept here as the reference."""
    if not s:
        return ""
    s = _BLOCK.sub("\n", s)
    s = _TAG.sub("", s)
    s = html.unescape(s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def best_ms(fn, *args) -> float:
    """Best of three: a time budget must not fail on one slow moment of the machine."""
    best = float("inf")
    for _ in range(3):
        t = time.perf_counter()
        try:
            fn(*args)
        except http.FetchError:
            pass
        best = min(best, (time.perf_counter() - t) * 1000)
    return best


HOSTILE = {
    "only <": "<" * N,
    "only spaces": " " * N,
    "spaces then tabs": (" " * 1000 + "\t" * 1000) * (N // 2000),
    "< and a space": "< " * (N // 2),
    "unclosed tags": "<a " * (N // 3),
    "empty tags": "a<>" * (N // 3),
    "nested divs": "<div>" * (N // 5),
    "breaks": "<br>" * (N // 4),
    "block closers with spaces": ("<" + " " * 500 + "/p") * (N // 503),
    "entities": "&#" * (N // 2),
    "named entities": "&a" * (N // 2),
    "newlines": "\n" * N,
    "one < then text": "<" + "x" * (N - 1),
}


# 250,000 character references in one text: Python's own html.unescape takes
# about a microsecond for each (linear), so these two shapes get a wider budget.
ENTITY_SHAPES = {"entities", "named entities"}


@pytest.mark.parametrize("shape", sorted(HOSTILE))
def test_m7_stripping_tags_from_a_hostile_500_kb_text_takes_under_200_ms(shape):
    assert best_ms(strip_html, HOSTILE[shape]) < (500 if shape in ENTITY_SHAPES else BUDGET_MS)


def test_m7_stripping_returns_exactly_what_it_returned_before():
    fixed = [
        "",
        "plain",
        "<p>one</p><p>two</p>",
        "a<br>b<br/>c< BR >d",
        "<div class='x'>نص <b>عربي</b></div>\r\n<p>سطر  \t\n\n\n\nآخر</p>",
        "a < b and c > d",
        "<>",
        "<<>>",
        "a<>b<c>d",
        "x <!-- c > y --> z",
        "&lt;p&gt; &amp;amp; &#1575; &nbsp;",
        "tail spaces   ",
        "<li>1</li>  \n  <li>2</li>",
        "<h2>t</h2 >x</ h3>y<\n/p>z",
        "<",
        ">",
        "<a",
        "a>b<",
    ]
    for s in fixed:
        assert strip_html(s) == strip_html_before(s), s
    rnd = random.Random(20261007)
    alphabet = ["<", ">", "/", " ", "\t", "\n", "\r", "p", "br", "div", "h1", "&", "amp;", "#", ";", "a", "ب", "</p>", "<br>", "<>", "  \n"]
    for _ in range(5000):
        s = "".join(rnd.choice(alphabet) for _ in range(rnd.randint(0, 40)))
        assert strip_html(s) == strip_html_before(s), repr(s)


PAGE = '<h1 class="article-title">عنوان</h1><h2 class="article-title__question">س: سؤال</h2><div itemprop="articleBody"><p>جواب</p></div>'
URL = "https://binbaz.org.sa/fatwas/7/x"
BODY_OPEN = '<h1 class="article-title">t</h1><div itemprop="articleBody">'


def test_m7_a_real_shaped_page_is_still_read():
    rec = binbaz.parse_page(PAGE, URL, "7")
    assert (rec.title, rec.question, rec.body) == ("عنوان", "سؤال", "جواب")


@pytest.mark.parametrize(
    "page",
    [
        "<" * N,
        BODY_OPEN + "<" * N,
        BODY_OPEN + " " * N,
        BODY_OPEN + "< " * (N // 2),
        BODY_OPEN + "<div>" * (N // 5),
        BODY_OPEN + "&a" * (N // 2),
        # as much markup as a page may have, the rest text
        BODY_OPEN + "<div>" * (binbaz.MAX_MARKUP - 10) + "x" * (N - 5 * binbaz.MAX_MARKUP),
        BODY_OPEN + "&a;" * (binbaz.MAX_MARKUP - 10) + " " * (N - 3 * binbaz.MAX_MARKUP),
    ],
    ids=["only-lt", "body-lt", "body-spaces", "body-lt-space", "body-divs", "body-entities", "markup-at-limit", "entities-at-limit"],
)
def test_m7_parsing_a_hostile_500_kb_fatwa_page_takes_under_200_ms(page):
    assert best_ms(binbaz.parse_page, page[:N], URL, "7") < BUDGET_MS


def test_m7_parsing_a_hostile_500_kb_card_page_takes_under_200_ms():
    opening = '<script type="application/ld+json">'
    url = "https://islamenc.com/ar/enc-cards/card/1"
    assert best_ms(islamic_content.parse_card, (opening * (N // len(opening)))[:N], url, "1", "ar") < BUDGET_MS
    assert best_ms(islamic_content.parse_card, opening + "<" * N, url, "1", "ar") < BUDGET_MS
    # and a real-shaped card is still read
    card = opening + '{"@type": "QAPage", "url": "' + url + '", "mainEntity": {"name": "T", "text": "Q", "acceptedAnswer": {"text": "<p>A</p>"}}}</script>'
    rec = islamic_content.parse_card("<html>" + opening + "{bad</script>" + card, url, "1", "ar")
    assert (rec.title, rec.question, rec.body) == ("T", "Q", "A")


async def _get(body: bytes, accept: str) -> http.Fetched:
    async def resolve(host: str) -> list[str]:
        return ["93.184.216.34"]

    real, http.resolve_host = http.resolve_host, resolve
    try:
        transport = httpx.MockTransport(lambda request: httpx.Response(200, content=body, headers={"content-type": accept}))
        async with httpx.AsyncClient(transport=transport) as client:
            budget = http.SourceBudget(http.Budget(4, time.monotonic() + 10), 4, hosts=frozenset({"binbaz.org.sa"}))
            return await http.get(client, budget, URL, accept=accept)
    finally:
        http.resolve_host = real


async def test_m7_a_page_parsed_as_html_may_be_500_kb_at_most():
    assert http.HTML_MAX_BYTES == 500_000 < http.MAX_BYTES
    assert len((await _get(b"x" * 500_000, "text/html")).text) == 500_000
    with pytest.raises(http.FetchError) as e:
        await _get(b"x" * 500_001, "text/html")
    assert e.value.code == T.BAD_RESPONSE
    assert len((await _get(b"x" * 2_000_000, "application/json")).text) == 2_000_000  # data answers keep their own limit


async def test_m7_pages_are_parsed_off_the_event_loop(monkeypatch):
    where: list[bool] = []

    class Call:
        async def get(self, url, params=None, accept="application/json"):
            return http.Fetched(URL, 200, PAGE, "text/html")

    real = binbaz.parse_page

    def spy(*args):
        where.append(threading.current_thread() is threading.main_thread())
        return real(*args)

    monkeypatch.setattr(binbaz, "parse_page", spy)
    rec = await binbaz.fetch(Call(), T.Candidate("binbaz", "7", "ar", "t", 1))
    assert rec.body == "جواب" and where == [False]
