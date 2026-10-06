"""Neutral push notifications for CMP (rules.md §4: neutral by default).

No religious word, no app name, no mentor name and never the message text:
what shows on a lock screen must not reveal anything (CMP-01 R5, Layla).
"""

import asyncio
import logging
import uuid

from sqlalchemy import ARRAY, String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.platform import push
from app.platform.models import PushSubscription, User

log = logging.getLogger(__name__)

TEXTS: dict[str, dict[str, str]] = {
    # to a learner
    "reply": {"ar": "لديك رد جديد", "en": "You have a new reply", "tl": "May bago kang sagot"},
    # to a mentor
    "message": {"ar": "لديك رسالة جديدة", "en": "You have a new message", "tl": "May bago kang mensahe"},
    "urgent": {"ar": "طلب عاجل ينتظر ردًا", "en": "An urgent request is waiting", "tl": "May agarang kahilingang naghihintay"},
    "new_mentee": {"ar": "اختارك مستفيد جديد", "en": "A new learner chose you", "tl": "May bagong learner na pumili sa iyo"},
    # to the Sharia reviewer (CMP-02 R5)
    "referral": {"ar": "لديك سؤال جديد", "en": "You have a new question", "tl": "May bago kang tanong"},
    # to the team (CMP-04 R3 and its open question: dangerous reports and «خطر على أحد» alert at once)
    "report": {"ar": "بلاغ ينتظر المراجعة", "en": "A report is waiting for review", "tl": "May ulat na naghihintay ng pagsusuri"},
    "report_danger": {"ar": "بلاغ عاجل ينتظر المراجعة", "en": "An urgent report is waiting", "tl": "May agarang ulat na naghihintay"},
}

_pending: set[asyncio.Task] = set()


def text(kind: str, locale: str | None) -> str:
    t = TEXTS[kind]
    return t.get(locale or "ar", t["en"])


def payload(kind: str, locale: str | None, url: str) -> dict:
    return {"title": text(kind, locale), "body": "", "url": url, "tag": f"cmp-{kind}"}


async def to_user(session: AsyncSession, user_id: uuid.UUID, kind: str, url: str) -> int:
    user = await session.get(User, user_id)
    if user is None:
        return 0
    return await push.send_to_user(session, user_id, payload(kind, user.locale, url))


async def to_endpoint(session: AsyncSession, endpoint: str, kind: str, locale: str, url: str) -> int:
    """A guest's own device (CMP-01 R5): the endpoint it gave with its request."""
    sub = await session.scalar(
        select(PushSubscription).where(
            PushSubscription.endpoint == endpoint,
            PushSubscription.failed_at.is_(None),
            PushSubscription.replies_enabled.is_(True),  # PLT-06 R2: the replies switch
        )
    )
    if sub is None:
        return 0
    return int(await push.send(sub, payload(kind, locale, url)))


async def to_responders(session: AsyncSession, kind: str, url: str) -> int:
    """Every mentor and team member (urgent requests, CMP-01 R6)."""
    users = await session.scalars(select(User).where(User.roles.op("&&")(cast(["mentor", "team", "admin"], ARRAY(String(20))))))
    sent = 0
    for u in users:
        sent += await push.send_to_user(session, u.id, payload(kind, u.locale, url))
    return sent


async def to_role(session: AsyncSession, roles: list[str], kind: str, url: str) -> int:
    """Everyone holding one of `roles` (the team for reports, the Sharia reviewer for referrals)."""
    users = await session.scalars(select(User).where(User.roles.op("&&")(cast(roles, ARRAY(String(20))))))
    sent = 0
    for u in users:
        sent += await push.send_to_user(session, u.id, payload(kind, u.locale, url))
    return sent


def later(fn, *args) -> None:
    """Run `fn(session, *args)` in its own session after the current request,
    without delaying it (the danger path must answer the learner first).
    Errors are logged only."""

    async def run():
        from app.core.db import SessionLocal

        try:
            async with SessionLocal() as session:
                await fn(session, *args)
                await session.commit()  # push marks gone subscriptions
        except Exception:  # pragma: no cover - logged, never raised to the user
            log.warning("cmp notification failed", exc_info=True)

    task = asyncio.get_running_loop().create_task(run())
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def drain() -> None:
    """Tests: wait for background notifications."""
    while _pending:
        await asyncio.gather(*list(_pending))
