"""Edits beyond the book's text, each tied to a Sharia reviewer decision.

Applied by build.py after the coverage check and recorded in each lesson's
`edited` list ({card, lang, from, to, why}); validate.py undoes them before
its fidelity and safety checks, so everything else is still proven to come
from the source. Decisions: docs/agents/decisions.md, 2026-10-06 (مهند بن
صالح الفوزان): (1) an adhkar/phrase meaning stays in English and Filipino
after its Arabic wording, labelled «Meaning:» / «Kahulugan:», in every unit;
(2) where editions differ on a Sharia matter, the printed Arabic edition is
the reference and the translations are corrected.

Each edit: (lesson, card, lang, find, replace, why). `find` must occur once.
Text written by Claude (not from any edition) is marked AUTHORED and needs a
native speaker's and the reviewer's check.
"""

D1 = "decision 2026-10-06 (1): Arabic wording restored in place of a transliteration"
D2 = "decision 2026-10-06 (2): the printed Arabic edition is the reference"

EDITS = [
    ("u3-l1", "u3-l1-c3", "tl", "Ang kahulugan ng pagsasaksi: Walang",
     "Ang kahulugan ng pagsasaksi ng (لا إله إلا الله): Walang", D1 + "; its meaning follows in the sentence"),
    ("u4-l1", "u4-l1-c6", "tl", "pagka-Panginoon (Ruboobeeyah)", "pagka-Panginoon (الربوبية)", D1 + "; meaning precedes"),
    ("u4-l1", "u4-l1-c6", "tl", "sa pagsamba (Uluhiyah)", "sa pagsamba (الألوهية)", D1 + "; meaning precedes"),
    ("u4-l1", "u4-l1-c6", "tl", "mga pangalan at katangian, at kabilang", "mga pangalan at katangian (الأسماء والصفات), at kabilang",
     D1 + "; meaning precedes"),
    ("u4-l4", "u4-l4-c3", "tl", "pagsulat ng Allah ng lahat", "pagsulat ng Allah sa (اللوح المحفوظ) (Kahulugan: ang Iniingatang Talaan) ng lahat",
     D1 + "; AUTHORED: the Tagalog meaning is not in the edition"),
    ("u5-l1", "u5-l1-c6", "tl", "1 na magiging obligado ang paligo.", "1 Ang anumang nag-oobliga ng wudhu o paligo.",
     D2 + " (what requires wudu or ghusl); AUTHORED Tagalog wording"),
]


def apply(lessons_by_id: dict) -> None:
    for lid, cid, lang, find, repl, why in EDITS:
        lesson = lessons_by_id[lid]
        card = next(c for c in lesson["cards"] if c["id"] == cid)
        text = card["text"][lang]
        if text.count(find) != 1:
            raise SystemExit(f"edit {cid}.{lang}: {find!r} found {text.count(find)} times")
        card["text"][lang] = text.replace(find, repl)
        lesson.setdefault("edited", []).append({"card": cid, "lang": lang, "from": find, "to": repl, "why": why})


def undo(text: str, edits: list, cid: str, lang: str) -> str:
    for e in reversed(edits):
        if e["card"] == cid and e["lang"] == lang:
            text = text.replace(e["to"], e["from"])
    return text
