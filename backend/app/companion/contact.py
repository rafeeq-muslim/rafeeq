"""MOT-08 R6: Companion tells Motivation that a mentor got in touch with his mentee.

`MentorContacted {user_id}` (the learner's account id, nothing else) is
published when the learner's own chosen mentor (CMP-03 link) sends a message
in any of that learner's conversations: their private mentor thread, or a
help request of theirs he answers (CMP-02). Motivation reads it from the
outbox for an aggregate comparison only (at least 10 people per group).

Not sent: replies by anyone who is not the learner's chosen mentor (team
members, other mentors), Sharia-reviewer answers (`referrals.py`), guests
(no account), and learners who do not share their progress with this mentor
(`share_progress`, off by default): the permission governs what links this
mentor to the learner's progress, so without it Companion says nothing to
Motivation about their contact either. The event itself was approved by the
product owner on 2026-10-06 (blanket approval of pending proposals). At most one
event per learner per Riyadh day: the comparison only asks whether contact
happened during the period. Account deletion removes it with every outbox
row that names the account (`platform/auth.py::delete_account`).
"""

import uuid
from datetime import datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.companion.models import MentorLink
from app.core.events import OutboxEvent, publish

EVENT = "MentorContacted"
RIYADH = ZoneInfo("Asia/Riyadh")


async def mentor_contacted(session: AsyncSession, link: MentorLink | None, author_id: uuid.UUID, t: datetime) -> bool:
    """Publish MentorContacted for the link's learner when `author_id` is
    their mentor and they share progress with him, once per Riyadh day.
    Returns whether an event was published."""
    if link is None or link.mentor_id != author_id or not link.share_progress:
        return False
    uid = str(link.learner_id)
    day_start = datetime.combine(t.astimezone(RIYADH).date(), time.min, RIYADH)
    already = await session.scalar(
        select(OutboxEvent.id)
        .where(OutboxEvent.name == EVENT, OutboxEvent.payload["user_id"].astext == uid, OutboxEvent.created_at >= day_start)
        .limit(1)
    )
    if already is not None:
        return False
    await publish(session, EVENT, "CMP", {"user_id": uid})
    return True
