"""binbaz.org.sa (the official site of Sheikh Abdulaziz Ibn Baz), read live
(PRD live v3 §4).

Endpoints: the site's own search API, the one its search page calls (found
in /vendor/search/js/bundle.js), and the fatwa page itself. No key.
robots.txt disallows only /index.php. The API answers with
X-RateLimit-Limit: 120. Checked from this backend on 2026-10-06:

  search  GET https://binbaz.org.sa/api/search?q=...&type=fatwa&page=1
          -> {"Search": {"total", "results": [{"id", "reference", "title", "question", "searchHighlights"}], ...}}
  fetch   GET https://binbaz.org.sa/fatwas/{reference}/x  (301 to the canonical slug URL on the same host)
          -> HTML: <h1 class="article-title ..."> title, <h2 ... article-title__question ...> question,
             <div itemprop="articleBody" class="article-content"> answer (with its footnote citation)

Arabic only. Licence: the site footer «جميع الحقوق محفوظة والنقل متاح لكل مسلم
بشرط ذكر المصدر»; use by an AI assistant still to be confirmed (sources.md)."""

import asyncio
import re
from html.parser import HTMLParser

from app.knowledge.live_sources import http
from app.knowledge.live_sources import types as T
from app.knowledge.live_sources.registry import Call, Record
from app.knowledge.sources._common import strip_html

SEARCH = "https://binbaz.org.sa/api/search"
PAGE = "https://binbaz.org.sa/fatwas/{ref}/x"
AUTHOR = "عبد العزيز بن عبد الله بن باز"
_REF = re.compile(r"^\d{1,9}$")
_CANON = re.compile(r"^https://binbaz\.org\.sa/fatwas/(\d+)(?:/|$)")
MAX_MARKUP = 15_000  # tags, and entities, in one page (security review 2026-10-07, A-M7)


def parse_search(data: object, limit: int) -> list[T.Candidate]:
    try:
        rows = data["Search"]["results"]  # type: ignore[index]
    except (KeyError, TypeError):
        raise http.FetchError(T.BAD_RESPONSE) from None
    out: list[T.Candidate] = []
    for row in rows if isinstance(rows, list) else []:
        ref = str((row or {}).get("reference") or "")
        if not _REF.match(ref) or any(c.external_id == ref for c in out):
            continue
        out.append(T.Candidate("binbaz", ref, "ar", strip_html(str(row.get("title") or "")), len(out) + 1))
        if len(out) >= limit:
            break
    return out


class _Page(HTMLParser):
    """Collects the inner HTML of the title, the question and the article body."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.parts: dict[str, list[str]] = {"title": [], "question": [], "body": []}
        self._in: str | None = None
        self._depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        cls = a.get("class") or ""
        if self._in:
            self._depth += tag not in ("br", "img", "hr", "meta", "link", "input")
            self.parts[self._in].append(self.get_starttag_text() or "")
            return
        if tag == "h1" and "article-title" in cls and not self.parts["title"]:
            self._in, self._depth = "title", 1
        elif tag == "h2" and "article-title__question" in cls and not self.parts["question"]:
            self._in, self._depth = "question", 1
        elif tag == "div" and a.get("itemprop") == "articleBody" and not self.parts["body"]:
            self._in, self._depth = "body", 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._in:  # <br/>, <img/>: no depth change
            self.parts[self._in].append(self.get_starttag_text() or "")

    def handle_endtag(self, tag: str) -> None:
        if not self._in:
            return
        self._depth -= 1
        if self._depth <= 0:
            self._in = None
            return
        self.parts[self._in].append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if self._in:
            self.parts[self._in].append(data)

    def handle_entityref(self, name: str) -> None:
        if self._in:
            self.parts[self._in].append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self._in:
            self.parts[self._in].append(f"&#{name};")


def parse_page(html: str, final_url: str, ref: str) -> Record:
    m = _CANON.match(final_url)
    if not m or m.group(1) != ref:
        raise http.FetchError(T.BAD_RESPONSE)  # redirected somewhere else
    # html.parser costs a few microseconds per tag or entity whatever the page
    # says, so a page that is mostly markup is refused before it is parsed
    # (a real fatwa page of the allowed size has a few thousand tags).
    if html.count("<") > MAX_MARKUP or html.count("&") > MAX_MARKUP:
        raise http.FetchError(T.BAD_RESPONSE)
    p = _Page()
    p.feed(html)
    body = strip_html("".join(p.parts["body"]))
    if not body:
        raise http.FetchError(T.BAD_RESPONSE)
    question = strip_html("".join(p.parts["question"]))
    question = re.sub(r"^س\s*:\s*", "", question)
    return Record(
        external_id=ref,
        canonical_url=final_url,
        lang="ar",
        title=strip_html("".join(p.parts["title"])),
        body=body,
        question=question,
        attribution=AUTHOR,
        kind="fatwa",
    )


async def search(call: Call, terms: str, lang: str, limit: int) -> list[T.Candidate]:
    data = await call.get_json(SEARCH, {"q": terms, "type": "fatwa", "page": "1"})
    return parse_search(data, limit)


async def fetch(call: Call, cand: T.Candidate) -> Record:
    f = await call.get(PAGE.format(ref=cand.external_id), accept="text/html")
    return await asyncio.to_thread(parse_page, f.text, f.url, cand.external_id)  # off the event loop
