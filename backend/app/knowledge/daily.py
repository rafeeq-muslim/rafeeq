"""KNW-07: benefits and stories for the daily card.

Cards are kept in `content/discover/daily-cards.json`, in the order the
Sharia reviewer approves (the order is part of the content). Benefit cards
copy HadeethEnc's own hadith text, title, grade and benefits (`hints`)
unchanged from the normalized corpus, with the hadith id and version
(rules.md §1.3; HadeethEnc terms: no modification, cite the source).

Each card is a KNW-05 review item (`daily_card`), approved one language at a
time; learners only ever receive approved snapshots. Picking the card of
the day happens on the device (date modulo the number of cards), so the
server never needs anything about the learner.

Build: `uv run python -m app.knowledge.daily --build`
"""

import argparse
import json
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.knowledge import review
from app.knowledge.review import ReviewItem

LANGS = ("ar", "en", "tl")
ITEM_TYPE = "daily_card"

# «مقترح من Claude، يعتمده المراجع الشرعي»: short HadeethEnc hadith for a new
# Muslim's first months, present in Arabic, English and Tagalog. Order = order of days.
PROPOSED_HADITH = [
    66511,  # actions are by intentions
    5866,  # make things easy, do not make them hard
    5795,  # the religion is ease
    5348,  # do not belittle any good deed, even meeting your brother with a cheerful face
    4568,  # a good word is charity
    5797,  # Allah is gentle and loves gentleness
    65004,  # purity is half of faith
    65255,  # leaving what does not concern him
    4717,  # none of you believes until he loves for his brother
    5437,  # speak good or remain silent
    4709,  # do not get angry
    10101,  # the Muslim is the one from whose tongue and hand Muslims are safe
    5507,  # two words light on the tongue
    4555,  # Allah does not look at your forms
]


def cards_file() -> Path:
    return get_settings().content_dir / "discover" / "daily-cards.json"


@lru_cache
def load() -> dict[str, Any]:
    f = cards_file()
    if not f.exists():
        return {"cards": [], "previous": None}
    return json.loads(f.read_text(encoding="utf-8"))


def card_view(card: dict, lang: str) -> dict | None:
    """What a learner reads in one language (None if the language is absent)."""
    t = card.get("langs", {}).get(lang)
    if not t:
        return None
    view = {
        "id": card["id"],
        "kind": card.get("kind", "benefit"),
        "title": t.get("title", ""),
        "text": t["text"],
        "benefits": t.get("benefits", []),
        "explanation": t.get("explanation", ""),
        "grade": t.get("grade", ""),
        "attribution": t.get("attribution", ""),
        "source": {**card["source"], "url": t.get("url", card["source"].get("url", ""))},
    }
    if lang != "ar" and card.get("langs", {}).get("ar"):
        view["text_ar"] = card["langs"]["ar"]["text"]
    if card.get("kind") == "story":
        view["rafeeq_wording"] = True  # R2: labelled as Rafeeq's wording, not the source's text
    return view


def _review_items() -> Iterable[ReviewItem]:
    for i, card in enumerate(load()["cards"]):
        views = {lg: v for lg in LANGS if (v := card_view(card, lg)) is not None}
        yield ReviewItem(ITEM_TYPE, card["id"], order=(i,), group="daily", views=views)


review.register(ITEM_TYPE, _review_items)


def approved_cards(live: dict[str, Any]) -> list[dict]:
    """Ordered approved cards for one language (R1, R6)."""
    out = []
    for i, card in enumerate(load()["cards"]):
        snap = live.get(card["id"])
        if snap is not None:
            out.append({**snap, "order": i})
    return out


# --- build from the normalized corpus ----------------------------------------


def _corpus_records(ids: set[str]) -> dict[str, dict[str, dict]]:
    path = get_settings().corpus_dir / "hadeethenc.jsonl"
    out: dict[str, dict[str, dict]] = {}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            if r["ref_key"] in ids:
                out.setdefault(r["ref_key"], {})[r["lang"]] = r
    return out


def build(hadith_ids: list[int] = PROPOSED_HADITH) -> dict:
    recs = _corpus_records({str(h) for h in hadith_ids})
    cards = []
    for hid in hadith_ids:
        by_lang = recs.get(str(hid), {})
        if "ar" not in by_lang:
            continue
        langs = {}
        version = by_lang["ar"]["version"]
        for lg in LANGS:
            r = by_lang.get(lg)
            if not r:
                continue
            m = r.get("meta", {})
            explanation = r.get("context_text", "")
            hints = m.get("hints") or []
            # context_text = explanation + hints (KNW plan §3.4); keep only the explanation part.
            suffix = "\n\n" + "\n".join(hints)
            if hints and explanation.endswith(suffix):
                explanation = explanation[: -len(suffix)]
            langs[lg] = {
                "title": m.get("title", ""),
                "text": r["quote_text"],
                "benefits": list(hints),
                "explanation": explanation,
                "grade": m.get("grade", ""),
                "attribution": m.get("attribution", ""),
                "url": r["origin_url"],
                "passage_id": r["id"],
            }
        cards.append(
            {
                "id": f"hadeethenc-{hid}",
                "kind": "benefit",
                "hadith_id": hid,
                "source": {"name": "HadeethEnc.com", "url": by_lang["ar"]["origin_url"], "version": version},
                "langs": langs,
            }
        )
    return {
        "note": "KNW-07 daily cards. Proposed by Claude, to be approved by the Sharia reviewer (مقترح من Claude، يعتمده المراجع الشرعي). "
        "Text copied unchanged from HadeethEnc.com (normalized corpus); do not edit by hand, rebuild with `python -m app.knowledge.daily --build`.",
        "previous": None,
        "cards": cards,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    args = ap.parse_args()
    if args.build:
        data = build()
        f = cards_file()
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{len(data['cards'])} cards → {f}")


if __name__ == "__main__":
    main()
