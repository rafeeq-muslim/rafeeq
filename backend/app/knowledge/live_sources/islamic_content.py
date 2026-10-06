"""The Islamic Content Encyclopedia — islamenc.com («موسوعة المحتوى الإسلامي»,
"Islamic Encyclopedia"), read live (PRD live v3 §4).

Identity: the site names itself «موسوعة المحتوى الإسلامي» in its schema.org
Organization record and its llms.txt; owner not stated (probably ICSA ⚠️).
It is NOT islamhouse_enc (enc.islamhouse.com), and NOT the ICSA
`islamic-content-mcp-server` (whose tools cover QuranEnc, HadeethEnc,
IslamHouse, Bayan al-Islam, Risalat al-Haramain and al-Montaka, not this
encyclopedia). Confirmation by the product owner is still needed.

Endpoints (from the site's own page scripts; `publicApiUrl = https://islamenc.com/api`):

  search  GET https://islamenc.com/api/search/suggestions?q=...&lang={lang}&type=102
          -> [{"type": "card" | "encyclopedia" | "aya" | "book" | "phrase" ...,
               "title", "text", "metadata": {"external_id", "enc_id", ...}}]
          (response shape read from the site's search script, NOT called: see below)
  fetch   GET https://islamenc.com/{lang}/enc/{enc_id}/card/{external_id}
          -> HTML with a schema.org QAPage (Question name/text, acceptedAnswer text)
          (called and parsed from this backend on 2026-10-06: card 26011)
  list    GET https://islamenc.com/api/enc -> the 12 encyclopedias and card counts (called 2026-10-06)

⚠️ Not connected: robots.txt disallows `/*/search` for every agent, the
user-triggered AI agents included, so the backend does not call the search
endpoint; the site states only «جميع الحقوق محفوظة» (sources.md: Link mode,
data access to request). The connector stays blocked until
ASK_LIVE_ISLAMIC_CONTENT_SEARCH_PERMITTED=true is set after written access."""

import json
import re

from app.core.config import get_settings
from app.knowledge.live_sources import http
from app.knowledge.live_sources import types as T
from app.knowledge.live_sources.registry import Call, Record
from app.knowledge.sources._common import strip_html

SEARCH = "https://islamenc.com/api/search/suggestions"
CARD = "https://islamenc.com/{lang}/enc/{enc}/card/{card}"
CARD_SHARED = "https://islamenc.com/{lang}/enc-cards/card/{card}"
# The site's own map: encyclopedias with their own card URLs (individualEncIds).
INDIVIDUAL = {"101", "102", "103", "104", "105", "106", "107", "108", "109"}
QUESTIONS = "102"  # «موسوعة الأسئلة والأجوبة للمسلمين» (the site's "questions" filter)
_ID = re.compile(r"^\d{1,9}$")
_LDJSON = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def blocked_reason() -> str | None:
    return None if get_settings().ask_live_islamic_content_search_permitted else T.NOT_CONNECTED


def card_url(lang: str, enc: str, card: str) -> str:
    return CARD.format(lang=lang, enc=enc, card=card) if enc in INDIVIDUAL else CARD_SHARED.format(lang=lang, card=card)


def parse_search(data: object, lang: str, limit: int) -> list[T.Candidate]:
    if not isinstance(data, list):
        raise http.FetchError(T.BAD_RESPONSE)
    out: list[T.Candidate] = []
    for s in data:
        if not isinstance(s, dict) or s.get("type") not in ("card", "encyclopedia"):
            continue
        meta = s.get("metadata") if isinstance(s.get("metadata"), dict) else {}
        card, enc = str(meta.get("external_id") or ""), str(meta.get("enc_id") or "")
        if not _ID.match(card) or not _ID.match(enc) or any(c.external_id == card for c in out):
            continue
        out.append(T.Candidate("islamic_content", card, lang, strip_html(str(s.get("title") or "")), len(out) + 1, meta={"enc_id": enc}))
        if len(out) >= limit:
            break
    return out


def parse_card(html: str, url: str, card: str, lang: str) -> Record:
    for m in _LDJSON.finditer(html):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        if not isinstance(d, dict) or d.get("@type") != "QAPage":
            continue
        if d.get("url") != url:
            raise http.FetchError(T.BAD_RESPONSE)  # not the card we asked for
        q = d.get("mainEntity") or {}
        a = q.get("acceptedAnswer") or {}
        body = strip_html(str(a.get("text") or ""))
        if not body:
            break
        author = (a.get("author") or {}).get("name") if isinstance(a.get("author"), dict) else None
        return Record(
            external_id=card,
            canonical_url=url,
            lang=lang,
            title=strip_html(str(q.get("name") or "")),
            body=body,
            question=strip_html(str(q.get("text") or "")),
            attribution=author,
            kind="article",
        )
    raise http.FetchError(T.BAD_RESPONSE)  # no card text the backend can read


async def search(call: Call, terms: str, lang: str, limit: int) -> list[T.Candidate]:
    data = await call.get_json(SEARCH, {"q": terms, "lang": lang, "type": QUESTIONS})
    return parse_search(data, lang, limit)


async def fetch(call: Call, cand: T.Candidate) -> Record:
    url = card_url(cand.lang, cand.meta.get("enc_id", ""), cand.external_id)
    f = await call.get(url, accept="text/html")
    return parse_card(f.text, url, cand.external_id, cand.lang)
