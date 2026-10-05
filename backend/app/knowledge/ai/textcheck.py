"""Deterministic text checks shared by the answer verifier (plan §4.6) and
the learning-task checkers (KNW-10 R2). No model, no network."""

import re
import unicodedata

ARABIC = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
SALLA = "ﷺ"  # ﷺ, appears in the source translations themselves (plan 4.6 check 4)
_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})
MARKER = re.compile(r"\{\{q:([^{}\s]+)\}\}")
WORD = re.compile(r"[\w؀-ۿ']+", re.U)


_AR_PUNCT = re.compile("[،؛؟٪-٭۔]")  # Arabic comma, semicolon, question mark, percent, separators, full stop


def normalize(text: str) -> str:
    """Lowercase, no Arabic diacritics or tatweel, folded alef/ya/ta marbuta,
    punctuation to spaces. Used for phrase matching and overlap checks."""
    t = unicodedata.normalize("NFKC", text).lower()
    t = _DIACRITICS.sub("", t).translate(_FOLD)
    t = _AR_PUNCT.sub(" ", t)
    t = re.sub(r"[^\w؀-ۿ\s']", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def words(text: str) -> list[str]:
    return WORD.findall(normalize(text))


def strip_markers(text: str) -> str:
    return MARKER.sub(" ", text)


def has_arabic(text: str) -> bool:
    return bool(ARABIC.search(text.replace(SALLA, "")))


# Quoted spans: "…", “…”, «…», ﴿…﴾, „…“
_QUOTES = re.compile(r"\"([^\"]+)\"|“([^”]+)”|«([^»]+)»|﴿([^﴾]+)﴾|„([^“]+)“")


def quoted_spans(text: str) -> list[str]:
    return [next(g for g in m.groups() if g) for m in _QUOTES.finditer(text)]


def longest_quote_words(text: str) -> int:
    return max((len(words(q)) for q in quoted_spans(text)), default=0)


_STOP = {
    "en": {"the", "and", "of", "to", "is", "in", "that", "it", "you", "for", "are", "with", "this", "be", "your", "a", "an", "on", "as"},
    "tl": {
        "ang",
        "ng",
        "sa",
        "mga",
        "na",
        "ay",
        "ito",
        "siya",
        "hindi",
        "para",
        "kung",
        "at",
        "ka",
        "mo",
        "ko",
        "ni",
        "niya",
        "nang",
        "rin",
        "din",
    },
}


def language_matches(text: str, lang: str) -> bool:
    """Plan 4.6 check 6. Arabic: most letters are Arabic. en vs tl: function
    words decide; short or ambiguous text passes."""
    body = strip_markers(text)
    letters = [c for c in body if c.isalpha()]
    if not letters:
        return False
    arabic_share = sum(1 for c in letters if ARABIC.match(c)) / len(letters)
    if lang == "ar":
        return arabic_share >= 0.6
    if arabic_share > 0.2:
        return False
    ws = words(body)
    en = sum(1 for w in ws if w in _STOP["en"])
    tl = sum(1 for w in ws if w in _STOP["tl"])
    if en + tl < 4:
        return True
    return (en >= tl) if lang == "en" else (tl >= en)


# Formulae every Muslim says (shahada, basmala, salawat, taraddi): saying them
# is not quoting a passage, so they are left out of the overlap check.
FORMULAE = [
    "اشهد ان لا اله الا الله",
    "ان لا اله الا الله",
    "لا اله الا الله",
    "محمد رسول الله",
    "محمدا رسول الله",
    "محمدا عبده ورسوله",
    "بسم الله الرحمن الرحيم",
    "صلي الله عليه وسلم",
    "رضي الله عنهما",
    "رضي الله عنهم",
    "رضي الله عنها",
    "رضي الله عنه",
]


def _without_formulae(text: str, sentinel: str) -> str:
    """Formulae replaced by a sentinel word, so they neither match nor join
    the words around them into a longer run."""
    t = f" {normalize(text)} "
    for f in FORMULAE:
        t = t.replace(f" {f} ", f" {sentinel} ")
    return t


def ngram_overlap(text: str, source: str, n: int) -> bool:
    """True if `text` repeats `n` or more consecutive words of `source` (plan 4.6 check 7)."""
    a, b = words(_without_formulae(text, "zzformulaa")), words(_without_formulae(source, "zzformulab"))
    if len(a) < n or len(b) < n:
        return False
    grams = {tuple(b[i : i + n]) for i in range(len(b) - n + 1)}
    return any(tuple(a[i : i + n]) in grams for i in range(len(a) - n + 1))


# Attribution of a saying (KNW-10 R2: "no ayah, no hadith, no attributed saying").
ATTRIBUTION = re.compile(
    r"\b(prophet|messenger|allah|he|she|they|imam|scholars?|ibn \w+|abu \w+)\s+(has\s+|have\s+)?(said|says|narrated|reported)\b"
    r"|\b(said|says)\s*:|\bnarrated\b|\breported\b|\b(sinabi|winika|isinalaysay|iniulat)\s+n[ig]\b"
    r"|قال\s*(رسول|النبي|تعالى|الله)|قال\s*:|رواه|روى|ﷺ|\(pbuh\)|peace be upon him",
    re.I,
)
# Latin transliteration of dhikr or ayat (rules.md §1.4: no transliteration of al-Fatiha or adhkar).
TRANSLIT = re.compile(
    r"\b(bismillah\w*|alhamdulillah\w*|al-?hamdu|subhan\w*|allahu akbar|la ilaha|ilallah|astaghfirullah|ashhadu|"
    r"rabbil|ar-?rahman|ar-?rahim|maliki|iyyaka|ihdina|sirat|qul huwa|a'?udhu|audhu)\b",
    re.I,
)
