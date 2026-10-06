"""PLT-05 R6: what Companion keeps about one account. Only this person's own
data: their conversations with a human (replies show the responder's role,
never a name), their own group messages, their reports and blocks (without
who was reported or blocked), and, for a mentor, their own profile and the
groups they lead (without members or join codes)."""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.companion.models import (
    Block,
    Group,
    GroupMember,
    GroupMessage,
    HelpMessage,
    HelpRequest,
    MenteeStatus,
    MentorApplication,
    MentorLink,
    MentorProfile,
    Report,
)


async def export_user(session: AsyncSession, user_id: uuid.UUID) -> dict:
    requests = (await session.scalars(select(HelpRequest).where(HelpRequest.learner_id == user_id).order_by(HelpRequest.created_at))).all()
    conversations = []
    for r in requests:
        msgs = await session.scalars(
            select(HelpMessage)
            .where(HelpMessage.request_id == r.id, or_(HelpMessage.hidden.is_(False), HelpMessage.author_id == user_id))
            .order_by(HelpMessage.created_at)
        )
        conversations.append(
            {
                "kind": r.kind,
                "topic": r.topic,
                "language": r.lang,
                "status": r.status,
                "created_at": r.created_at,
                "messages": [{"from": "me" if m.author == "learner" else m.author, "text": m.body, "at": m.created_at} for m in msgs],
            }
        )
    groups = await session.execute(
        select(Group.name, Group.lang, GroupMember.joined_at)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == user_id)
    )
    group_msgs = await session.execute(
        select(Group.name, GroupMessage.body, GroupMessage.created_at)
        .join(Group, Group.id == GroupMessage.group_id)
        .where(GroupMessage.author_id == user_id)
        .order_by(GroupMessage.created_at)
    )
    led = await session.scalars(select(Group).where(Group.mentor_id == user_id).order_by(Group.created_at))
    link = await session.get(MentorLink, user_id)
    status = await session.get(MenteeStatus, user_id)
    profile = await session.get(MentorProfile, user_id)
    reports = await session.scalars(select(Report).where(Report.reporter_id == user_id).order_by(Report.created_at))
    application = await session.scalar(
        select(MentorApplication).where(MentorApplication.user_id == user_id).order_by(MentorApplication.created_at.desc()).limit(1)
    )
    blocks = await session.scalars(select(Block.created_at).where(Block.blocker_id == user_id).order_by(Block.created_at))
    return {
        "conversations_with_a_human": conversations,
        "groups": [{"name": n, "language": lang, "joined_at": at} for n, lang, at in groups],
        "my_group_messages": [{"group": n, "text": body, "at": at} for n, body, at in group_msgs],
        "my_mentor": {"share_progress": link.share_progress, "chosen_at": link.chosen_at} if link else None,
        "engagement_shared_with_mentor": status.status if status else None,
        "mentor_profile": (
            {
                "capacity": profile.capacity,
                "about": profile.about,
                "availability": profile.availability,
                "accepting": profile.accepting,
                "mentor_rules_accepted_at": profile.rules_accepted_at,  # ORG-02 R2
                "suspended": profile.suspended,  # ORG-02 R5
            }
            if profile
            else None
        ),
        "groups_i_lead": [{"name": g.name, "language": g.lang, "capacity": g.capacity, "created_at": g.created_at} for g in led],
        "reports_i_filed": [
            {"reason": r.reason, "about": r.target_type, "note": r.note, "status": r.status, "at": r.created_at} for r in reports
        ],
        "blocks": [{"at": at} for at in blocks],
        # CMP-08 R7: what the person wrote and its state; never the team's note or the invite code.
        "mentor_application": (
            {
                "display_name": application.display_name,
                "gender": application.gender,
                "languages": application.languages,
                "place": application.place,
                "about": application.about,
                "contact": application.readable_contact(),
                "status": application.status,
                "applied_at": application.created_at,
                "decided_at": application.decided_at,
            }
            if application
            else None
        ),
    }
