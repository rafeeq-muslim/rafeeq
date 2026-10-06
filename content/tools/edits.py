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
D3 = "spelling slip in the source corrected (letters only), reviewer's review of 2026-10-06"

EDITS = [
    ("u3-l1", "u3-l1-c3", "tl", "Ang kahulugan ng pagsasaksi: Walang",
     "Ang kahulugan ng pagsasaksi ng (لا إله إلا الله): Walang", D1 + "; its meaning follows in the sentence"),
    ("u4-l1", "u4-l1-c6", "tl", "pagka-Panginoon (Ruboobeeyah)", "pagka-Panginoon (الربوبية)", D1 + "; meaning precedes"),
    ("u4-l1", "u4-l1-c6", "tl", "sa pagsamba (Uluhiyah)", "sa pagsamba (الألوهية)", D1 + "; meaning precedes"),
    ("u4-l1", "u4-l1-c6", "tl", "mga pangalan at katangian, at kabilang", "mga pangalan at katangian (الأسماء والصفات), at kabilang",
     D1 + "; meaning precedes"),
    ("u4-l4", "u4-l4-c3", "tl", "pagsulat ng Allah ng lahat", "pagsulat ng Allah sa (اللوح المحفوظ) (Kahulugan: ang Iniingatang Talaan) ng lahat",
     D1 + "; AUTHORED: the Tagalog meaning is not in the edition"),
    ("u2-l1", "u2-l1-c4", "tl", "Sya angTagapaglikha, ang Tagapagtustos,", "Sya ang Tagapagmay-ari, ang Tagapaglikha, ang Tagapagtustos,",
     D2 + " (the Arabic names المالك, the Possessor); AUTHORED Tagalog word; also a missing space"),
    ("u4-l1", "u4-l1-c6", "ar", "وخالقة ورازقه", "وخالقه ورازقه", D3),
    ("u4-l1", "u4-l1-c7", "ar", "المستحق العبادة وحدة", "المستحق العبادة وحده", D3),
    ("u5-l1", "u5-l1-c6", "tl", "1 na magiging obligado ang paligo.", "1 Ang anumang nag-oobliga ng wudhu o paligo.",
     D2 + " (what requires wudu or ghusl); AUTHORED Tagalog wording"),
]


D4 = "decision 2026-10-06: where a lesson states one view on a matter the madhhabs differ on, a short note says so (rules.md §1.4)"

MADHHAB_NOTE = {
    "ar": "وفي بعض مسائل هذا الدرس خلاف بين العلماء، وما ذُكر هنا قولٌ معتبر من أقوالهم، فتعلّم تفاصيلها مع مرشدك.",
    "en": "Scholars differ on some points in this lesson; what is given here is one recognised view among theirs. Learn the details with your mentor.",
    "tl": "May pagkakaiba ng pananaw ang mga iskolar sa ilang punto ng araling ito; ang nakasaad dito ay isa sa kanilang kinikilalang pananaw. Pag-aralan ang mga detalye kasama ang iyong mentor.",
}

# Cards written for Rafeeq, not taken from any edition: (lesson, text, why). Marked
# `authored` so validate.py checks them for safety but not against the source, and
# does not require an exercise for them. AUTHORED: Filipino needs a native speaker.
NOTES = [
    ("u5-l1", MADHHAB_NOTE, D4 + "; points: the wiping period's start; AUTHORED"),
    ("u5-l2", MADHHAB_NOTE, D4 + "; points: reciting the Quran in janabah; AUTHORED"),
    ("u5-l3", MADHHAB_NOTE, D4 + "; points: one strike, face and hands only; AUTHORED"),
]


def add_notes(lessons_by_id: dict) -> None:
    for lid, text, why in NOTES:
        lesson = lessons_by_id[lid]
        n = len(lesson["cards"]) + 1
        lesson["cards"].append({"id": f"{lid}-c{n}", "kind": "text", "text": dict(text), "image_url": None,
                                "quran": None, "source_ref": "note", "authored": True, "why": why})


def apply(lessons_by_id: dict) -> None:
    for lid, cid, lang, find, repl, why in EDITS:
        lesson = lessons_by_id[lid]
        card = next(c for c in lesson["cards"] if c["id"] == cid)
        text = card["text"][lang]
        if text.count(find) != 1:
            raise SystemExit(f"edit {cid}.{lang}: {find!r} found {text.count(find)} times")
        card["text"][lang] = text.replace(find, repl)
        lesson.setdefault("edited", []).append({"card": cid, "lang": lang, "from": find, "to": repl, "why": why})
    add_notes(lessons_by_id)


def undo(text: str, edits: list, cid: str, lang: str) -> str:
    for e in reversed(edits):
        if e["card"] == cid and e["lang"] == lang:
            text = text.replace(e["to"], e["from"])
    return text
