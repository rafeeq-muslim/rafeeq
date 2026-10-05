"""Email delivery for optional 2FA codes. If SMTP is not configured the code
is not sent and callers report `email_unavailable` (no silent fallback)."""

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

log = logging.getLogger(__name__)

_TEXT = {
    "ar": ("رمز الدخول", "رمزك: {code}\nصالح لعشر دقائق. إن لم تطلبه فتجاهل هذه الرسالة."),
    "en": ("Your sign-in code", "Your code: {code}\nValid for 10 minutes. If you did not ask for it, ignore this email."),
    "tl": ("Ang iyong code", "Ang iyong code: {code}\nMaaari sa loob ng 10 minuto. Kung hindi mo ito hiningi, huwag pansinin."),
}


def email_configured() -> bool:
    return bool(get_settings().smtp_host)


def _send(to: str, subject: str, body: str) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.smtp_from, to, subject
    msg.set_content(body)
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password)
        smtp.send_message(msg)


async def send_code(to: str, code: str, locale: str) -> bool:
    """Neutral subject and body: no app name, nothing religious (PLT-05)."""
    if not email_configured():
        return False
    subject, body = _TEXT.get(locale, _TEXT["en"])
    try:
        await asyncio.to_thread(_send, to, subject, body.format(code=code))
        return True
    except Exception:  # delivery failures must not leak details to the client
        log.exception("email delivery failed")
        return False
