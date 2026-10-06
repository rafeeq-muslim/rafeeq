"""Events Companion listens to (docs/domains.md).

- DangerDetected (KNW-01 R5): `{ask_id, lang, detector}`, no identity and no
  question text. Becomes an urgent alert at the top of every inbox; all
  mentors and team members get a neutral push (CMP-01 R6). The device that
  opens `/mentor/help?kind=urgent&ask=<ask_id>` becomes its owner.
- EngagementStatusChanged (MOT-07 R3): CMP keeps the status for accounts so
  a mentor sees it while the learner shares progress (CMP-02 R6). Only the
  account events `{user_id, status}` are kept: Motivation sends ONE status
  per account across its devices (MOT-07 R2/R6); device events
  `{install_id, status}` (for Organisations) carry no user_id and are ignored.
- EscalationRequested (KNW-01 R2/R3) creates nothing: a request exists only
  when the person asks for a human.
- AccountDeleted (PLT-05 R5): the person's own group messages go with the
  account, so nothing they wrote stays in the group. Their help requests,
  memberships, group removals (CMP-05 R5), mentor link and blocks already
  cascade on users.id; replies
  they wrote as a mentor stay in the learners' own conversations without a
  name (author SET NULL), and reports they filed stay without a reporter.
- MentorApproved (ORG-02 R1): `{mentor_id}`. The mentor's profile exists and
  is not suspended; the inbox still waits for the mentor rules (ORG-02 R2).
- MentorSuspended (ORG-02 R5): `{mentor_id}`. The mentor loses the inbox and
  is no longer suggested; each mentee's link ends (thread closed, and it never
  reopens to him, even after MentorApproved: CMP-03 R4) and they get
  a neutral notice to choose another mentor (no reason, no organisation); the
  mentor's open requests return to the pool, where the same-gender rule
  (CMP-01 R3) applies as always.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.companion import notify
from app.companion.models import GroupMessage, HelpRequest, MenteeStatus, MentorEnded, MentorLink
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


@subscribe("AccountDeleted")
async def on_account_deleted(session: AsyncSession, payload: dict) -> None:
    uid = payload.get("user_id")
    if uid:
        await session.execute(delete(GroupMessage).where(GroupMessage.author_id == uuid.UUID(str(uid))))


@subscribe("EngagementStatusChanged")
async def on_engagement(session: AsyncSession, payload: dict) -> None:
    uid = payload.get("user_id")
    if not uid:
        return  # a device's own status (for ORG), or a guest: no mentor
    user_id = uuid.UUID(str(uid))
    row = await session.get(MenteeStatus, user_id)
    if row is None:
        row = MenteeStatus(user_id=user_id)
        session.add(row)
    row.status = payload.get("status")
    row.changed_at = datetime.now(UTC)


@subscribe("MentorApproved")
async def on_mentor_approved(session: AsyncSession, payload: dict) -> None:
    from app.companion.inbox import profile_of

    prof = await profile_of(session, uuid.UUID(str(payload["mentor_id"])))
    prof.suspended = False


@subscribe("MentorSuspended")
async def on_mentor_suspended(session: AsyncSession, payload: dict) -> None:
    from app.companion.inbox import profile_of
    from app.companion.mentors import end_link

    mentor_id = uuid.UUID(str(payload["mentor_id"]))
    prof = await profile_of(session, mentor_id)
    prof.suspended = True
    learners = []
    for link in list(await session.scalars(select(MentorLink).where(MentorLink.mentor_id == mentor_id))):
        learners.append(link.learner_id)
        await end_link(session, link)
        if await session.get(MentorEnded, link.learner_id) is None:
            session.add(MentorEnded(learner_id=link.learner_id, at=datetime.now(UTC)))
    # His open requests go back to every matching inbox (CMP-02 R1, R3).
    await session.execute(
        update(HelpRequest)
        .where(HelpRequest.mentor_id == mentor_id, HelpRequest.kind != "mentor", HelpRequest.status != "closed")
        .values(mentor_id=None, status="open")
    )
    for learner_id in learners:
        notify.later(notify.to_user, learner_id, "mentor_change", "/mentor")
