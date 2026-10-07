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


_BRACED = re.compile(r"\{\{([^{}]*)\}\}")
_Q_PREFIX = re.compile(r"^\s*q\s*:\s*", re.I)
_Q_ANY = re.compile(r"(^|[\s,;،])q\s*:\s*", re.I)  # a «q:» that starts an id, not the «qa:» inside «islamqa:»
_ID_SEP = re.compile(r"[\s,;،]+")


def fix_marker_id(raw: str, ids: set[str] | frozenset[str]) -> str | None:
    """`raw` as a retrieved id, with a stray «q:» prefix or spaces removed; None if it is not one."""
    i = _Q_PREFIX.sub("", raw).strip()
    return i if i in ids else None


def fix_markers(text: str, ids: set[str] | frozenset[str]) -> str:
    """KNW-01 answer rate: the composer often writes a marker as {{ID}},
    {{q: ID}}, {{Q:ID}} or {{q:ID1, q:ID2}}; each was rejected as
    `malformed_marker` (prod 2026-10-06). A braced span becomes {{q:ID}}
    markers only when EVERY id in it is one of `ids` (this attempt's
    retrieved passages); anything else is left as written, so the checks
    still reject it. Never invents an id."""

    def one(m: re.Match[str]) -> str:
        span = _Q_ANY.sub(r"\1", m.group(1))
        fixed = [fix_marker_id(p, ids) for p in _ID_SEP.split(span) if p]
        if not fixed or any(f is None for f in fixed):
            return m.group(0)
        return " ".join(f"{{{{q:{f}}}}}" for f in fixed)

    return _BRACED.sub(one, text)


# An answer is plain words: no address to visit, no account to contact, no
# markup (security review 2026-10-07, B-L1). A passage read live from a
# website could ask the model to send the reader somewhere; the sources an
# answer rests on are shown by the app as cards, never written by the model.
# Quran references («2:255»), source names («al-Bukhari», «IslamQA») and
# ordinary punctuation never match. Each pattern is linear.
_ANSWER_LINK = re.compile(
    r"(?i:https?:|ftp:|mailto:|tel:|javascript:|data:)\s*\S"
    r"|(?i:\bwww\.)\w"
    r"|[A-Za-z0-9-]\.[A-Za-z]{2,}/\S"  # name.tld/path
    r"|[A-Za-z0-9-]\.(?:com|net|org|info|xyz|site|online|link|app|COM|NET|ORG|INFO)(?![A-Za-z0-9-])"  # a bare domain
)
_ANSWER_HANDLE = re.compile(r"@\w|\w@")
_ANSWER_MARKUP = re.compile(r"</?[A-Za-z][^<>\n]{0,200}>|<!--|\]\(|!\[|\[[^\[\]\n]{1,200}\]:|&#|&[a-z]{2,8};")


def link_or_markup(text: str) -> str | None:
    """What an answer must not contain: link | handle | markup, or None."""
    if _ANSWER_LINK.search(text):
        return "link"
    if _ANSWER_HANDLE.search(text):
        return "handle"
    if _ANSWER_MARKUP.search(text):
        return "markup"
    return None


def has_arabic(text: str) -> bool:
    return bool(ARABIC.search(text.replace(SALLA, "")))


# Quoted spans: "…", “…”, «…», ﴿…﴾, „…“
_QUOTE_END = {'"': '"', "“": "”", "«": "»", "﴿": "﴾", "„": "“"}


def quoted_spans(text: str) -> list[str]:
    """The same spans as the pattern  "([^"]+)"|“([^”]+)”|«([^»]+)»|﴿([^﴾]+)﴾|„([^“]+)“
    in one pass. As a pattern, a text of opening marks that are never closed
    was searched to its end from each of them (quadratic; security review
    2026-10-07): a mark with no closing mark left is now looked for once."""
    out: list[str] = []
    unclosed: set[str] = set()
    i, n = 0, len(text)
    while i < n:
        end = _QUOTE_END.get(text[i])
        if end is not None and text[i] not in unclosed:
            j = text.find(end, i + 1)
            if j == -1:
                unclosed.add(text[i])
            elif j > i + 1:
                out.append(text[i + 1 : j])
                i = j + 1
                continue
        i += 1
    return out


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


# KNW-01 answer rate: the same honorifics in the stored English and Tagalog
# translations. 1,875 of 2,328 English HadeethEnc passages contain «may
# Allah's peace and blessings be upon him» and 1,895 «may Allah be pleased
# with him» (dev corpus, 2026-10-06), so an answer that honours the Prophet
# or a Companion the way the sources do repeated 6 words of a hadith and was
# rejected as copied scripture. Honorifics only: never a phrase of a verse or
# hadith. Written as `latin_fold` leaves them (no apostrophes, no macrons);
# longest first, so a long form is replaced before the short form inside it.
LATIN_FORMULAE = [
    "may allah s peace and blessings be upon him",
    "may allah exalt his mention",
    "peace and blessings be upon him",
    "may allah be pleased with both of them",
    "may allah be pleased with them both",
    "may allah be pleased with them",
    "may allah be pleased with him",
    "may allah be pleased with her",
    "may allah have mercy on him",
    "may allah have mercy upon him",
    "peace be upon him",
    "basbasan siya ni allah at pangalagaan",
    "pagpalain siya ni allah at pangalagaan",
    "malugod si allah sa kanilang dalawa",
    "malugod si allah sa kanila",
    "malugod si allah sa kanya",
]


def latin_fold(text: str) -> str:
    """`normalize`, then Latin accents dropped (Allāh → allah) and apostrophes
    to spaces (Allah's / Allah’s → allah s). Used on both sides of the overlap
    check, so it can only find more copying, never less."""
    t = unicodedata.normalize("NFKD", normalize(text))
    t = "".join(c for c in t if not unicodedata.combining(c)).replace("'", " ")
    return re.sub(r"\s+", " ", t).strip()


def _without_formulae(text: str, sentinel: str) -> str:
    """Formulae replaced by a sentinel word, so they neither match nor join
    the words around them into a longer run."""
    t = f" {latin_fold(text)} "
    for f in (*FORMULAE, *LATIN_FORMULAE):
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
