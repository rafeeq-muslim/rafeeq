#!/usr/bin/env python3
"""Check a Rafeeq content unit (content/units/*/unit.json).

Usage: python content/check_content.py content/units/unit-01/unit.json

Checks structure and the content rules that can be checked mechanically:
every text in Arabic, English and Filipino; unique IDs; every objective
covered by at least two exercises (LRN-10); every card linked to an
objective; answers that exist; images that exist; and no transliterated
adhkar or Quran in the English and Filipino text (rules.md §1.4).
It does not judge Sharia accuracy: the Sharia reviewer approves that.
Exit code 0 = no blocking issues.
"""
import json
import re
import sys
from pathlib import Path

LANGS = ("ar", "en", "tl")
# Latin spellings of adhkar and Quran that must never be shown.
TRANSLITERATION = re.compile(
    r"allahu\s*-?\s*a?kbar|allahukbar|subh[aā]n|sami[‘'`ʿ]?\s*-?\s*allah|rabban[aā]|rabbi\s*-?\s*ighfir|"
    r"a[‘'`ʿ]?[uū]dh?u\s*bill|a[‘'`ʿ]?[uū]zu\s*bill|auzu|at-?\s*tahiy|as-?\s*sal[aā]mu|assalamu|bismill|"
    r"al-?\s*hamdu\s*lill|la\s+ilaha\s+illa|ashhadu|allahumma|wa\s+bihamdik",
    re.IGNORECASE)


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


def main(path):
    unit_path = Path(path)
    unit = json.loads(unit_path.read_text(encoding="utf8"))
    errors, warnings = [], []
    ids = []

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
    sys.exit(main(sys.argv[1]))
