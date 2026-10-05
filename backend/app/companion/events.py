"""Events Companion listens to (docs/domains.md).

- DangerDetected (KNW-01 R5): `{ask_id, lang, detector}`, no identity and no
  question text. Becomes an urgent alert at the top of every inbox; all
  mentors and team members get a neutral push (CMP-01 R6). The device that
  opens `/mentor/help?kind=urgent&ask=<ask_id>` becomes its owner.
- EngagementStatusChanged (MOT-07 R3): CMP keeps the status for accounts so
  a mentor sees it while the learner shares progress (CMP-02 R6).
- EscalationRequested (KNW-01 R2/R3) creates nothing: a request exists only
  when the person asks for a human.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.companion import notify
from app.companion.models import HelpRequest, MenteeStatus
from app.core.events import subscribe

LANGS = {"ar", "en", "tl"}


@subscribe("DangerDetected")
async def on_danger(session: AsyncSession, payload: dict) -> None:
    lang = str(payload.get("lang") or "ar")[:5]
    ask_id = payload.get("ask_id")
    t = datetime.now(UTC)
    session.add(
        HelpRequest(
            kind="urgent",
            lang=lang if lang in LANGS else "ar",
            handle="",
            source="ask",
            ask_id=str(ask_id)[:64] if ask_id else None,
            status="open",
            created_at=t,
            last_activity_at=t,
        )
    )
    notify.later(notify.to_responders, "urgent", "/inbox")


@subscribe("EngagementStatusChanged")
async def on_engagement(session: AsyncSession, payload: dict) -> None:
    uid = payload.get("user_id")
    if not uid:
        return  # guests have no mentor
    user_id = uuid.UUID(str(uid))
    row = await session.get(MenteeStatus, user_id)
    if row is None:
        row = MenteeStatus(user_id=user_id)
        session.add(row)
    row.status = payload.get("status")
    row.changed_at = datetime.now(UTC)
