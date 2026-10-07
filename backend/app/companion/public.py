"""Companion's read interface for other domains.

Permissions are asked live, never copied: a copy could keep showing progress
after the learner withdrew permission (MOT-07 R6, MOT-06 R4 ex3).

ORG-02 reads mentors' load and the missing (language, gender) pairs here, as
counts and pairs only: never a mentee, a request or a conversation.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.companion.groups import MENTOR_MEMBER_LIMIT, may_lead
from app.companion.inbox import MENTEE_CAP_DEFAULT
from app.companion.models import Group, GroupMember, HelpRequest, MentorLink, MentorProfile


async def shared_learner_ids(session: AsyncSession, mentor_id: uuid.UUID) -> set[uuid.UUID]:
    """Learners whose chosen mentor is `mentor_id` and who share progress with them now."""
    rows = await session.scalars(
        select(MentorLink.learner_id).where(MentorLink.mentor_id == mentor_id, MentorLink.share_progress.is_(True))
    )
    return set(rows)


async def may_lead_groups(session: AsyncSession, user) -> bool:
    """Security review B-M1, for MOT-06: is this account a mentor in good
    standing now (role held, mentor rules accepted, not suspended)? A group's
    mentor who is not gets nothing of the group, its challenge included."""
    return await may_lead(session, user)


@dataclass
class MentorLoad:
    """ORG-02 R3: a mentor's load and state, as counts only."""

    mentees: int
    capacity: int
    group_members: int
    group_limit: int
    accepting: bool
    suspended: bool
    rules_accepted: bool


async def mentor_loads(session: AsyncSession, mentor_ids: list[uuid.UUID]) -> dict[uuid.UUID, MentorLoad]:
    if not mentor_ids:
        return {}
    mentees: dict = dict(
        (
            await session.execute(
                select(MentorLink.mentor_id, func.count()).where(MentorLink.mentor_id.in_(mentor_ids)).group_by(MentorLink.mentor_id)
            )
        ).all()
    )
    members: dict = dict(
        (
            await session.execute(
                select(Group.mentor_id, func.count())
                .join(GroupMember, GroupMember.group_id == Group.id)
                .where(Group.mentor_id.in_(mentor_ids))
                .group_by(Group.mentor_id)
            )
        ).all()
    )
    profiles = {p.user_id: p for p in await session.scalars(select(MentorProfile).where(MentorProfile.user_id.in_(mentor_ids)))}
    out = {}
    for mid in mentor_ids:
        p = profiles.get(mid)
        out[mid] = MentorLoad(
            mentees=mentees.get(mid, 0),
            capacity=p.capacity if p else MENTEE_CAP_DEFAULT,
            group_members=members.get(mid, 0),
            group_limit=MENTOR_MEMBER_LIMIT,
            accepting=p.accepting if p else True,
            suspended=bool(p and p.suspended),
            rules_accepted=bool(p and p.rules_accepted_at),
        )
    return out


async def waiting_pairs(session: AsyncSession, langs: list[str]) -> set[tuple[str, str]]:
    """ORG-02 R4: (language, gender) pairs of requests waiting for a reply in
    the pool. Pairs only: never a count or anything about a person."""
    rows = await session.execute(
        select(HelpRequest.lang, HelpRequest.requester_gender)
        .where(
            HelpRequest.kind.in_(("human", "escalation")),
            HelpRequest.status == "open",
            HelpRequest.requester_gender.is_not(None),
            HelpRequest.lang.in_(langs),
        )
        .distinct()
    )
    return {(lang, g) for lang, g in rows if g}
