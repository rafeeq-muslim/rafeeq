"""Message text rules shared by every CMP conversation.

CMP-01 R5: no phone numbers, e-mail addresses, messenger or social handles,
or links are stored or shown (rules.md §4; marriage, money and recruitment
usually start by moving the talk off Rafeeq, companion README).

The checks are written to leave ordinary Arabic and English text and Quran
references («2:255», «البقرة 255-257», dates such as 1447/03/20) alone."""

import asyncio
import re

from fastapi import HTTPException, status

MAX_BODY = 2000
CHECK_TIMEOUT_S = 2.0

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹＠", "01234567890123456789@")

# Top-level domains that end a bare link («example.com», «x.com», «lnkd.in»).
_TLD = (
    r"(?:com|net|org|info|biz|me|io|co|ly|gg|app|dev|page|xyz|link|site|online|store|shop|live|chat|social|"
    r"tv|cc|to|im|ai|us|uk|ca|au|de|fr|ru|in|pk|ph|sa|ae|eg|qa|kw|om|bh|jo|ma|tr|id|my|ng|tk|ml|ga|cf)"
)
# The patterns below run on text whose whitespace runs are collapsed to ONE
# space (`_SPACES`), so no pattern needs `\s*` or `\s+`: two neighbouring
# quantifiers that can both take the same whitespace made the old patterns
# exponential (security review 2026-10-07, A-H1). Rules for editing them:
# a single optional space (` ?`) only, possessive runs (`++`), bounded repeats,
# and a lookbehind so a run is tried once from its start, never from each letter.
_SPACES = re.compile(r"\s+")
_AT = r"(?: ?(?:@|\( ?at ?\)|\[ ?at ?\]|\{ ?at ?\}) ?| at )"
_DOT = r"(?: ?(?:\.|\( ?dot ?\)|\[ ?dot ?\]|\{ ?dot ?\}) ?| dot )"
_LOCAL = r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]++"

_EMAIL = re.compile(r"(?<![^\s@])[^\s@]++@[^\s@]+\.[^\s@]{2,}")
# «name @ gmail . com», «name at gmail dot com», «name (at) mail [dot] org»
_EMAIL_SPELLED = re.compile(
    rf"{_LOCAL}{_AT}[A-Za-z0-9-]++(?:{_DOT}[A-Za-z0-9-]++){{0,8}}?{_DOT}{_TLD}(?![A-Za-z0-9])",
    re.IGNORECASE,
)
# «name at gmail», «name @ hotmail»: a mail provider named after «at».
_EMAIL_PROVIDER = re.compile(
    rf"{_LOCAL}{_AT}(?:gmail|googlemail|hotmail|yahoo|outlook|icloud|live|aol|yandex|proton(?:mail)?)(?![A-Za-z0-9])",
    re.IGNORECASE,
)

_LINK = re.compile(
    r"(?:https?://|www\.)\S"
    r"|(?:wa\.me|t\.me/|m\.me/|fb\.me|lnkd\.in|kik\.me|snapchat\.com|x\.com)",
    re.IGNORECASE,
)
# Any bare domain: letters (or digits), then a dot and a known TLD. As one
# pattern this is
#   (?<![A-Za-z0-9_-])[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9-]+)*\.TLD(?![A-Za-z0-9-])
# which starts again at every label of «a.a.a.a…» (quadratic). `_bare_domain`
# gives the same answer in one pass over the labels.
_DOMAIN_RUN = re.compile(r"[A-Za-z0-9_.-]+")
_FIRST_LABEL = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?")
_LATER_LABEL = re.compile(r"[A-Za-z0-9-]+")
_TLD_LABEL = re.compile(rf"{_TLD}(?![A-Za-z0-9-])", re.IGNORECASE)


def _bare_domain(text: str) -> bool:
    for run in _DOMAIN_RUN.finditer(text):
        chain = False  # the labels just before this one form the start of a domain
        for label in run.group(0).split("."):
            if chain and _TLD_LABEL.match(label):
                return True
            if _FIRST_LABEL.fullmatch(label):
                chain = True
            elif not (chain and _LATER_LABEL.fullmatch(label)):
                chain = False
    return False


# A messenger or social network named next to a handle: «snap: layla_99»,
# «telegram @layla», «insta layla.k», «واتساب: layla99», «سناب layla_99».
_NETWORKS = (
    r"(?:snap(?:chat)?|telegram|tg|whats ?app|insta(?:gram)?|ig|kik|wechat|viber|discord|tik ?tok|twitter|threads|"
    r"linked ?in|facebook|fb|skype|imo|signal|"
    r"سناب(?: ?شات)?|تيليجرام|تيليغرام|تلجرام|تلغرام|تليجرام|واتساب|واتس ?اب|واتس|انستا|إنستا|انستقرام|إنستغرام|انستغرام|"
    r"كيك|تويتر|فيسبوك|فيس ?بوك|تيك ?توك|لينكد ?إن|ديسكورد|سكايب|إيمو|ايمو|سيجنال|سغنال)"
)
_HANDLE_AFTER_SEPARATOR = re.compile(
    rf"(?<![A-Za-z]){_NETWORKS}ي? ?(?:id|user(?:name)?|name|account|حسابي|يوزر|معرفي|اسمي)? ?[:：=] ?@?[A-Za-z0-9_.]{{3,}}",
    re.IGNORECASE,
)
# Without «:», the handle must look like one (an @, a digit, «_» or «.»), so
# «a telegram group», «on instagram today» or «my telegram is broken» pass.
_HANDLE_BARE = re.compile(
    rf"(?<![A-Za-z]){_NETWORKS}ي? ?(?:id|user(?:name)?|name|account|حسابي|يوزر|معرفي|اسمي)? (?:is |هو )?(?:@[A-Za-z0-9_.]{{2,}}|(?=[A-Za-z0-9_.]*[0-9_.])[A-Za-z][A-Za-z0-9_.]{{2,}})",
    re.IGNORECASE,
)
# «@layla_k»: a social handle on its own (an e-mail address is caught first).
_AT_HANDLE = re.compile(r"(?<![A-Za-z0-9._%+-])@[A-Za-z0-9_][A-Za-z0-9_.]{2,}")

# Phone numbers: a run of digits with phone separators (no «:» so «2:255» never matches).
_PHONE_CANDIDATE = re.compile(r"(?<![\d:])(?:\+|00)?\(?\d[\d \t\u00a0\-().·/]*\d\)?")
_DATE = re.compile(r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}")


def _is_phone(s: str) -> bool:
    s = s.strip()
    digits = re.sub(r"\D", "", s)
    n = len(digits)
    if n < 7 or n > 15:
        return False
    groups = [g for g in re.split(r"\D+", s) if g]
    if s.startswith(("+", "00")) or s.startswith("(") and n >= 8:
        return True
    if len(groups) == 1:
        return n >= 8  # one run of 8+ digits; 7 alone is more often an amount
    if _DATE.fullmatch(s):
        return False
    spaces_only = re.fullmatch(r"[\d \t\u00a0]+", s) is not None
    if spaces_only and all(len(g) <= 3 for g in groups):
        return False  # a list of short numbers, such as verse numbers «255 256 257»
    if any(len(g) >= 3 for g in groups):
        return True  # «555-1234», «055 123 4567», «(050) 123 4567»
    return n >= 8 and not spaces_only  # «05.01.23.45.67»


def contact_violation(body: str) -> str | None:
    """The kind of contact detail found in `body` (email | link | handle | phone), or None.

    Linear in the length of `body` (tests/test_sec_contact_filter_time.py)."""
    translated = body.translate(_DIGITS)
    text = _SPACES.sub(" ", translated)
    if ("@" in text and _EMAIL.search(text)) or _EMAIL_SPELLED.search(text) or _EMAIL_PROVIDER.search(text):
        return "email"
    if _LINK.search(text) or _bare_domain(text):
        return "link"
    if _HANDLE_AFTER_SEPARATOR.search(text) or _HANDLE_BARE.search(text) or _AT_HANDLE.search(text):
        return "handle"
    # Phones keep the original spacing: a line break is not a phone separator.
    if any(_is_phone(m.group(0)) for m in _PHONE_CANDIDATE.finditer(translated)):
        return "phone"
    return None


def clean_body(body: str | None, *, required: bool = True) -> str:
    """Trim, enforce length, and refuse contact details (422)."""
    body = (body or "").strip()
    if not body:
        if required:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "empty_message")
        return ""
    if len(body) > MAX_BODY:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "message_too_long")
    if kind := contact_violation(body):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"code": "contact_not_allowed", "kind": kind})
    return body


async def clean_body_async(body: str | None, *, required: bool = True) -> str:
    """`clean_body` for request handlers: the scan runs in a worker thread, so
    even a slow one cannot hold the event loop (second layer behind the linear
    patterns), and a scan that does not finish refuses the message."""
    stripped = (body or "").strip()
    if not stripped or len(stripped) > MAX_BODY:
        return clean_body(body, required=required)  # nothing to scan
    try:
        return await asyncio.wait_for(asyncio.to_thread(clean_body, body, required=required), CHECK_TIMEOUT_S)
    except TimeoutError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "message_not_checked") from None
