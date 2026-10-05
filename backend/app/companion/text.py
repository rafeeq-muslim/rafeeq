"""Message text rules shared by every CMP conversation.

CMP-01 R3: no phone numbers, e-mail addresses or messenger/social invite
links are stored or shown (rules.md §4; marriage, money and recruitment
usually start by moving the talk off Rafeeq, companion README)."""

import re

from fastapi import HTTPException, status

MAX_BODY = 2000

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}")
_PHONE = re.compile(r"\+?\d(?:[\s\-().]*\d){7,}")
_LINKS = re.compile(
    r"(wa\.me|whatsapp\.com|t\.me/|telegram\.(?:me|org|dog)|signal\.(?:me|group)|line\.me|viber\.com|"
    r"instagram\.com|facebook\.com|fb\.me|fb\.com|m\.me/|snapchat\.com|tiktok\.com|discord\.(?:gg|com)|imo\.im|wechat\.com)",
    re.IGNORECASE,
)


def contact_violation(body: str) -> str | None:
    """The kind of contact detail found in `body`, or None."""
    text = body.translate(_DIGITS)
    if _EMAIL.search(text):
        return "email"
    if _LINKS.search(text):
        return "link"
    if _PHONE.search(text):
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
