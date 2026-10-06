#!/usr/bin/env python3
"""Check a Rafeeq content unit (content/units/*/unit.json).

Usage: python content/check_content.py content/units/unit-01/unit.json
       python content/check_content.py --learner-content
         (citations only, KNW-05 R2: the pipeline lessons content/lessons/*.json,
          quran_excerpts.json, quran_recitation.json and discover/daily-cards.json)

Checks structure and the content rules that can be checked mechanically:
every text in Arabic, English and Filipino; unique IDs; every objective
covered by at least two exercises (LRN-10); every card linked to an
objective; answers that exist; images that exist; and no transliterated
adhkar or Quran in the English and Filipino text (rules.md §1.4).
Citations (KNW-05 R2): a Quran reference to a verse that does not exist, or a
`hadith_ids` entry that is not in the stored HadeethEnc corpus, is refused.
Glossary (KNW-03 R3): a listed concept written with a spelling the glossary
marks as not approved is flagged for the reviewer.
It does not judge Sharia accuracy: the Sharia reviewer approves that.
Exit code 0 = no blocking issues.
"""
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

LANGS = ("ar", "en", "tl")
# Latin spellings of adhkar and Quran that must never be shown.
TRANSLITERATION = re.compile(
    r"allahu\s*-?\s*a?kbar|allahukbar|subh[aā]n|sami[‘'`ʿ]?\s*-?\s*allah|rabban[aā]|rabbi\s*-?\s*ighfir|"
    r"a[‘'`ʿ]?[uū]dh?u\s*bill|a[‘'`ʿ]?[uū]zu\s*bill|auzu|at-?\s*tahiy|as-?\s*sal[aā]mu|assalamu|bismill|"
    r"al-?\s*hamdu\s*lill|la\s+ilaha\s+illa|ashhadu|allahumma|wa\s+bihamdik",
    re.IGNORECASE)


# --- KNW-05 R2 ex2: citations must name a verse or hadith that exists -------------
# Number of ayat in each surah (Hafs); the same table as frontend/src/app/discover/ayaCount.ts.
AYA_COUNT = (
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18,
    12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8,
    11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
)
QURAN_REF = re.compile(r"(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?")


def ayah_ref_error(ref):
    """None if `ref` ('2:222' or '1:1-7') names verses that exist, else the reason."""
    m = QURAN_REF.fullmatch(str(ref).strip())
    if not m:
        return f"malformed Quran reference {ref!r} (expected sura:aya or sura:aya-aya)"
    sura, first, last = int(m.group(1)), int(m.group(2)), int(m.group(3) or m.group(2))
    if not 1 <= sura <= 114:
        return f"unknown surah in {ref!r}"
    if not 1 <= first <= last <= AYA_COUNT[sura - 1]:
        return f"unknown ayah in {ref!r} (surah {sura} has {AYA_COUNT[sura - 1]})"
    return None


def corpus_dir():
    """The approved-source corpus outside the repo (backend app.knowledge.sources._common)."""
    root = Path(os.environ.get("RAFEEQ_DATA_DIR", Path.home() / ".local/share/rafeeq"))
    return root / "corpus"


def hadith_ids_in_corpus(directory):
    """{hadith id: {langs}} from hadeethenc.jsonl, or None when the corpus is not here."""
    f = Path(directory) / "hadeethenc.jsonl"
    if not f.exists():
        return None
    out = {}
    with f.open(encoding="utf8") as fh:
        for line in fh:
            if line.strip():
                row = json.loads(line)
                out.setdefault(str(row["ref_key"]), set()).add(row["lang"])
    return out


def quran_field_ref(q):
    """A pipeline lesson card's `quran` field ({"sura": 2, "ayat": [21, 21]}) as
    'sura:aya' or 'sura:aya-aya' text, or None when it is not of that shape."""
    if not isinstance(q, dict):
        return None
    sura, ayat = q.get("sura"), q.get("ayat")
    if not (type(sura) is int and isinstance(ayat, list) and len(ayat) == 2 and all(type(a) is int for a in ayat)):
        return None
    return f"{sura}:{ayat[0]}" if ayat[0] == ayat[1] else f"{sura}:{ayat[0]}-{ayat[1]}"


def card_quran_ref(c):
    """The Quran reference a card cites: a team card's `ref`/`quran_ref` text or a
    pipeline card's `quran` field (LRN-01 lessons, content/lessons/*.json)."""
    for key in ("ref", "quran_ref"):
        if c.get(key):
            return str(c[key]).strip()
    return quran_field_ref(c.get("quran")) if c.get("quran") is not None else None


def check_hadith_id(where, h, known, errors, warnings):
    """One HadeethEnc id: refused when malformed or absent from the stored corpus.
    Returns True when it could not be checked (no corpus here)."""
    if not (isinstance(h, int) or (isinstance(h, str) and h.isdigit())) or int(h) < 1:
        errors.append(f"{where}: hadith id {h!r} is not a HadeethEnc id")
    elif known is None:
        return True
    elif str(int(h)) not in known:
        errors.append(f"{where}: hadith {h} is not in the stored HadeethEnc corpus")
    else:
        missing = [lg for lg in LANGS if lg not in known[str(int(h))]]
        if missing:
            warnings.append(f"{where}: hadith {h} has no stored record in {', '.join(missing)}")
    return False


UNCHECKED_HADITH = "hadith ids not checked against the corpus: hadeethenc.jsonl not found (set RAFEEQ_DATA_DIR)"


def check_citations(unit, errors, warnings, corpus=None):
    """Every Quran reference names verses that exist; every `hadith_ids` entry is
    a HadeethEnc id in the stored corpus (unknown → refused, KNW-05 R2 ex2).
    Works on a team unit and on a pipeline lesson wrapped as {"lessons": [lesson]}."""
    known = hadith_ids_in_corpus(corpus or corpus_dir())
    unverified = False
    for lesson in unit["lessons"]:
        for c in lesson["cards"]:
            for key in ("ref", "quran_ref"):
                if c.get(key):
                    why = ayah_ref_error(c[key])
                    if why:
                        errors.append(f"{c['id']}: {why}")
            if c.get("quran") is not None:
                ref = quran_field_ref(c["quran"])
                why = ayah_ref_error(ref) if ref else f"malformed Quran reference {c['quran']!r} (expected {{sura, ayat: [from, to]}})"
                if why:
                    errors.append(f"{c['id']}: {why}")
            ids = c.get("hadith_ids") or []
            if (c.get("kind") == "hadith" or c.get("contains_hadith")) and not ids:
                warnings.append(f"{c['id']}: cites a hadith without hadith_ids; the review desk cannot show its stored record")
            for h in ids:
                unverified |= check_hadith_id(c["id"], h, known, errors, warnings)
    if unverified:
        warnings.append(UNCHECKED_HADITH)


def quran_words_in_corpus(directory, refs):
    """{'sura:aya': number of words in the stored Arabic verse} for `refs`, split
    on spaces as the app does (VerseBlock excerptOf), or None when the corpus is not here."""
    f = Path(directory) / "quranenc.jsonl"
    if not f.exists():
        return None
    out = {}
    with f.open(encoding="utf8") as fh:
        for line in fh:
            if '"quran_arabic"' not in line:
                continue
            row = json.loads(line)
            if row.get("kind") == "quran_arabic" and row["ref_key"] in refs:
                out[row["ref_key"]] = len(row["quote_text"].split(" "))
    return out


def check_learner_content(root, errors, warnings, corpus=None):
    """KNW-05 R2 ex2 beyond the team units: every verse or hadith the learner sees
    in other content names one that exists.
    - content/lessons/*.json (pipeline units 2-6 and the replaced unit 1): each card's `quran`;
    - content/quran_excerpts.json: each `ref` exists and is the verse its card shows,
      and `verse_words` is the stored verse's word count (corpus);
    - content/quran_recitation.json: each `ref` exists and is the verse its cards show;
    - content/discover/daily-cards.json: each `hadith_id` is in the stored corpus.
    The verse-range part needs nothing outside the repo and always runs; the corpus
    parts warn and are skipped when the corpus is not here (as for the team units)."""
    root = Path(root)
    corpus = corpus or corpus_dir()
    card_refs = {}  # every card id the learner can see -> the Quran reference it shows
    for f in sorted((root / "lessons").glob("*.json")):
        lesson = json.loads(f.read_text(encoding="utf8"))
        check_citations({"lessons": [lesson]}, errors, warnings, corpus)
        card_refs.update({c["id"]: card_quran_ref(c) for c in lesson["cards"]})
    for f in sorted((root / "units").glob("*/unit.json")):
        unit = json.loads(f.read_text(encoding="utf8"))
        card_refs.update({c["id"]: card_quran_ref(c) for les in unit["lessons"] for c in les["cards"]})

    excerpts = json.loads((root / "quran_excerpts.json").read_text(encoding="utf8"))["cards"]
    words = quran_words_in_corpus(corpus, {str(e.get("ref")) for e in excerpts.values()})
    for cid, e in excerpts.items():
        where = f"quran_excerpts.json {cid}"
        why = ayah_ref_error(e.get("ref"))
        if why:
            errors.append(f"{where}: {why}")
            continue
        if cid not in card_refs:
            errors.append(f"{where}: no lesson card {cid}")
        elif card_refs[cid] != e["ref"]:
            errors.append(f"{where}: ref {e['ref']} but the card shows {card_refs[cid]}")
        if words is not None:
            if e["ref"] not in words:
                errors.append(f"{where}: verse {e['ref']} has no stored Arabic record")
            elif words[e["ref"]] != e.get("verse_words"):
                errors.append(f"{where}: verse_words {e.get('verse_words')} but the stored verse {e['ref']} has {words[e['ref']]} words")
    if words is None:
        warnings.append("excerpt verse_words not checked against the stored verses: quranenc.jsonl not found (set RAFEEQ_DATA_DIR)")

    recitation = json.loads((root / "quran_recitation.json").read_text(encoding="utf8"))
    for v in recitation["verses"]:
        where = f"quran_recitation.json {v.get('ref')}"
        why = ayah_ref_error(v.get("ref"))
        if why or "-" in str(v.get("ref")):
            errors.append(f"{where}: {why or 'a recitation file is one verse'}")
            continue
        for cid in v.get("cards") or []:
            if card_refs.get(cid) != v["ref"]:
                errors.append(f"{where}: card {cid} shows {card_refs.get(cid, 'no such card')}")

    daily = root / "discover" / "daily-cards.json"
    if daily.exists():
        known = hadith_ids_in_corpus(corpus)
        unverified = False
        for c in json.loads(daily.read_text(encoding="utf8"))["cards"]:
            if "hadith_id" in c:
                unverified |= check_hadith_id(f"daily-cards.json {c.get('id')}", c["hadith_id"], known, errors, warnings)
        if unverified:
            warnings.append(UNCHECKED_HADITH)


def main_learner_content(root=None, corpus=None):
    errors, warnings = [], []
    check_learner_content(root or Path(__file__).parent, errors, warnings, corpus)
    for w in dict.fromkeys(warnings):
        print("  ! " + w)
    for e in errors:
        print("  ✗ " + e)
    print("OK: lesson citations" if not errors else f"{len(errors)} blocking citation issue(s)")
    return 1 if errors else 0


# --- KNW-03 R3 ex2: a listed term written with a non-approved spelling -----------
_AR_MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
_AR_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه"})


def _norm(s):
    return _AR_MARKS.sub("", unicodedata.normalize("NFKC", s)).translate(_AR_FOLD).lower()


def _spelled(text, spelling):
    s = _norm(spelling).strip()
    if not s:
        return False
    if re.search(r"[؀-ۿ]", s):
        stem = s[2:] if s.startswith("ال") and len(s) > 4 else s
        return stem in text
    return re.search(rf"(?<![\w']){re.escape(s)}(?![\w'])", text) is not None


def load_glossary(path=None):
    f = Path(path) if path else Path(__file__).parent / "glossary" / "terms.json"
    return json.loads(f.read_text(encoding="utf8")).get("terms", []) if f.exists() else []


def check_glossary(unit, warnings, terms):
    """Flag, for the Sharia reviewer, a glossary concept written with a spelling
    the glossary lists as not approved (`alternates`) in that language."""
    for where, text in walk(unit):
        for lang in LANGS:
            for t in terms:
                v = (t.get("langs") or {}).get(lang) or {}
                if not v.get("term"):
                    continue
                body = _norm(text[lang]).replace(_norm(v["term"]), " ")
                for alt in v.get("alternates") or []:
                    if _norm(alt) != _norm(v["term"]) and _spelled(body, alt):
                        warnings.append(f"{where}: {lang} writes {alt!r} for {t['concept']}; the approved term is {v['term']!r} (KNW-03 R3)")


def walk(node, path=""):
    if isinstance(node, dict):
        if set(node) == set(LANGS) and all(isinstance(v, str) for v in node.values()):
            yield path, node
            return
        for k, v in node.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")


def main(path, corpus=None, glossary=None):
    unit_path = Path(path)
    unit = json.loads(unit_path.read_text(encoding="utf8"))
    errors, warnings = [], []
    ids = []
    check_citations(unit, errors, warnings, corpus)  # KNW-05 R2
    check_glossary(unit, warnings, load_glossary(glossary))  # KNW-03 R3

    for where, text in walk(unit):
        for lang in LANGS:
            if not text[lang].strip():
                errors.append(f"{where}: empty {lang} text")
        for lang in ("en", "tl"):
            m = TRANSLITERATION.search(text[lang])
            if m:
                errors.append(f"{where}: transliteration in {lang}: {m.group(0)!r}")

    for lesson in unit["lessons"]:
        lid = lesson["id"]
        objectives = {o["id"] for o in lesson["objectives"]}
        cards = {c["id"]: c for c in lesson["cards"]}
        ids += [lid, *objectives, *cards, *(e["id"] for e in lesson["exercises"])]
        if not 2 <= len(objectives) <= 4:
            errors.append(f"{lid}: {len(objectives)} objectives (LRN-10 needs 2 to 4)")
        for o in lesson["objectives"]:
            if "label" not in o:
                errors.append(f"{o['id']}: no learner name (label); objective text is for the team only (LRN-10 R1)")

        covered_by_cards = set()
        for c in cards.values():
            if not c.get("objectives"):
                errors.append(f"{c['id']}: card not linked to an objective")
            for o in c.get("objectives", []):
                if o not in objectives:
                    errors.append(f"{c['id']}: unknown objective {o}")
                covered_by_cards.add(o)
            for img in [c.get("image"), *c.get("extra_images", [])]:
                if img and not (unit_path.parent / img).exists():
                    errors.append(f"{c['id']}: missing image {img}")
            if c["kind"] in ("quran", "hadith") or c.get("contains_hadith"):
                if not c.get("verify"):
                    warnings.append(f"{c['id']}: Quran or hadith card without a verify note")

        exercise_count = {o: 0 for o in objectives}
        for e in lesson["exercises"]:
            for o in e["objectives"]:
                if o not in objectives:
                    errors.append(f"{e['id']}: unknown objective {o}")
                else:
                    exercise_count[o] += 1
            if e["explain_card"] not in cards:
                errors.append(f"{e['id']}: explain_card {e['explain_card']} not in lesson")
            if e["type"] == "choice":
                if e["answer"] not in {o["id"] for o in e["options"]}:
                    errors.append(f"{e['id']}: answer not among options")
                if len(e["options"]) < 2:
                    errors.append(f"{e['id']}: fewer than two options")
            elif e["type"] == "order":
                if sorted(e["answer"]) != sorted(i["id"] for i in e["items"]):
                    errors.append(f"{e['id']}: order answer does not match items")
            elif e["type"] == "match":
                if len(e["pairs"]) < 2:
                    errors.append(f"{e['id']}: fewer than two pairs")
            else:
                errors.append(f"{e['id']}: unknown exercise type {e['type']}")

        for o, n in exercise_count.items():
            if n < 2:
                errors.append(f"{o}: covered by {n} exercise(s); LRN-10 needs at least 2")
            if o not in covered_by_cards:
                errors.append(f"{o}: no card teaches this objective")

    # verses the book quotes only in part (content/quran_excerpts.json)
    excerpts = json.loads((Path(__file__).parent / "quran_excerpts.json").read_text(encoding="utf8"))["cards"]
    unit_cards = {c["id"]: c for l in unit["lessons"] for c in l["cards"]}
    err = errors.append
    def check_excerpt(cid, ex, verse_words):
        for lg in ("ar", "en", "tl"):
            w = (ex.get(lg) or {}).get("words")
            if not (isinstance(w, list) and len(w) == 2 and 1 <= w[0] <= w[1] <= verse_words):
                err(f"{cid}: excerpt words {w} for {lg} outside the verse (1..{verse_words})")
            if lg != "ar" and not (ex.get(lg) or {}).get("translation", "").strip():
                err(f"{cid}: excerpt has no {lg} translation from the book")
    for cid, e in excerpts.items():
        if cid.split("-")[0] != unit["id"]:
            continue
        c = unit_cards.get(cid)
        if not c or "excerpt" not in c:
            err(f"{cid}: listed in quran_excerpts.json but the card has no excerpt")
            continue
        check_excerpt(cid, c["excerpt"], e["verse_words"])

    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        errors.append(f"duplicate ids: {sorted(dupes)}")

    lessons = unit["lessons"]
    n_cards = sum(len(l["cards"]) for l in lessons)
    n_ex = sum(len(l["exercises"]) for l in lessons)
    n_obj = sum(len(l["objectives"]) for l in lessons)
    print(f"{unit['id']}: {len(lessons)} lessons, {n_obj} objectives, {n_cards} cards, {n_ex} exercises, status {unit['status']}")
    for w in warnings:
        print("  ! " + w)
    for e in errors:
        print("  ✗ " + e)
    print("OK" if not errors else f"{len(errors)} blocking issue(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    if sys.argv[1] == "--learner-content":
        sys.exit(main_learner_content())
    sys.exit(main(sys.argv[1]))
