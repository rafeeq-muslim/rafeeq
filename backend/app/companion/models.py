"""Companion & Community (CMP): help requests to a human, mentors, groups,
reports and blocks. A mentor sees only what the learner allows."""

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin

_user_fk = lambda: ForeignKey("users.id", ondelete="CASCADE")  # noqa: E731


class MentorProfile(Base):
    __tablename__ = "cmp_mentor_profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    capacity: Mapped[int] = mapped_column(Integer, default=8)  # CMP-02 R4: 8 by default, at most 10 (Osool p.102: 5–10)
    about: Mapped[str] = mapped_column(Text, default="")
    availability: Mapped[str] = mapped_column(String(120), default="")
    # CMP-02 R4: paused = not suggested to new learners and no new requests
    # from the pool; current mentees, own threads and urgent requests stay.
    accepting: Mapped[bool] = mapped_column(Boolean, default=True)
    # ORG-02 R2: the mentor rules are accepted before the inbox opens.
    rules_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # ORG-02 R5 (MentorSuspended): no inbox, not suggested, no new groups,
    # until the organisation approves them again (MentorApproved).
    suspended: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class MentorLink(Base):
    """CMP-03: the learner's chosen mentor and the share-progress permission
    (off by default; MOT-03 R6, MOT-07 R6)."""

    __tablename__ = "cmp_mentor_links"
    learner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    mentor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), index=True)
    share_progress: Mapped[bool] = mapped_column(Boolean, default=False)
    chosen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # CMP-03 R5: the mentor's first message to this learner («رحّب به» until then).
    welcomed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MentorEnded(Base):
    """ORG-02 R5: the learner's mentor was suspended or lost approval. The
    learner sees a neutral notice (no reason, no organisation) until they
    choose another mentor (CMP-03) or dismiss it."""

    __tablename__ = "cmp_mentor_ended"
    learner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MenteeStatus(Base):
    """CMP-02 R6: Companion's copy of EngagementStatusChanged (MOT-07). Shown
    to the mentor only while the learner shares progress with them."""

    __tablename__ = "cmp_mentee_status"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    status: Mapped[str | None] = mapped_column(String(12), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HelpRequest(IdMixin, Base):
    """CMP-01. Guests are identified by a device secret (hash stored), so a
    human can answer without the guest creating an account. An urgent alert
    from DangerDetected has no owner until the device opens it."""

    __tablename__ = "cmp_help_requests"
    learner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), _user_fk(), nullable=True, index=True)
    guest_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    handle: Mapped[str] = mapped_column(String(40))  # display name, or a 4-digit guest number
    lang: Mapped[str] = mapped_column(String(5))
    kind: Mapped[str] = mapped_column(String(10))  # human | escalation | urgent | mentor
    topic: Mapped[str | None] = mapped_column(String(24), nullable=True)
    source: Mapped[str | None] = mapped_column(String(12), nullable=True)  # lesson | review | ask | home | mentor
    # CMP-01 R3: the requester's own gender (m | f); only someone of the same
    # gender answers. Null only on urgent requests (anyone answers) and on
    # requests made before the rule. The column keeps its first name so the
    # previous image still runs on this schema (additive migrations only).
    requester_gender: Mapped[str | None] = mapped_column("prefer_gender", String(1), nullable=True)
    ask_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    push_endpoint: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | answered | closed
    mentor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    first_reply_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HelpMessage(IdMixin, Base):
    __tablename__ = "cmp_help_messages"
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cmp_help_requests.id", ondelete="CASCADE"), index=True)
    author: Mapped[str] = mapped_column(String(8))  # learner | mentor | scholar | system
    author_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ScholarReferral(IdMixin, Base):
    """CMP-02 R5: a mentor gives no fatwa; he refers one learner message (a
    personal Sharia question) to the Sharia reviewer, who answers it in the
    same conversation as «أهل العلم». The reviewer sees the question and its
    language only, never who asked."""

    __tablename__ = "cmp_scholar_referrals"
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cmp_help_requests.id", ondelete="CASCADE"), index=True)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cmp_help_messages.id", ondelete="CASCADE"), unique=True)
    lang: Mapped[str] = mapped_column(String(5))
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | answered
    referred_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    answered_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    answer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cmp_help_messages.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Group(IdMixin, Base):
    """CMP-05: small, same-gender, same-language, with a mentor. 10 members
    by default, at most 15; at most 25 across all of a mentor's groups."""

    __tablename__ = "cmp_groups"
    name: Mapped[str] = mapped_column(String(60))
    lang: Mapped[str] = mapped_column(String(5))
    gender: Mapped[str] = mapped_column(String(1))
    mentor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), index=True)
    capacity: Mapped[int] = mapped_column(Integer, default=10)
    join_code: Mapped[str] = mapped_column(String(12), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GroupMember(Base):
    __tablename__ = "cmp_group_members"
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cmp_groups.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GroupMessage(IdMixin, Base):
    __tablename__ = "cmp_group_messages"
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cmp_groups.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Report(IdMixin, Base):
    """CMP-04: one-tap report; marriage, money and group-recruitment are
    high priority and hide the message at once (companion README)."""

    __tablename__ = "cmp_reports"
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reporter_guest_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_type: Mapped[str] = mapped_column(String(16))  # group_message | help_message
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    reason: Mapped[str] = mapped_column(String(24))  # marriage | money | recruitment | danger | abuse | other | mentor_hidden
    priority: Mapped[str] = mapped_column(String(6), default="normal")  # danger | high | normal
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | actioned | dismissed
    handled_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Block(IdMixin, Base):
    """CMP-04 R5. A guest blocks the mentor answering them by device hash."""

    __tablename__ = "cmp_blocks"
    blocker_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), _user_fk(), nullable=True, index=True)
    blocker_guest_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    blocked_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MentorApplication(IdMixin, Base):
    """CMP-08: someone asks to become a mentor; the team (or the coordinator
    of the organisation whose code they entered) decides. `contact` is the
    single place Rafeeq keeps a contact detail for a mentor, and only staff
    read it (R3). `about` and `contact` go on rejection; the whole row goes
    90 days after a decision, or after 90 days unanswered (R6)."""

    __tablename__ = "cmp_mentor_applications"
    display_name: Mapped[str] = mapped_column(String(40))
    gender: Mapped[str] = mapped_column(String(1))  # same-gender rule (CMP-01 R3)
    languages: Mapped[list[str]] = mapped_column(ARRAY(String(5)))
    locale: Mapped[str] = mapped_column(String(5), default="ar")  # the form's language, to answer in it
    place: Mapped[str | None] = mapped_column(String(80), nullable=True)
    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact: Mapped[str | None] = mapped_column(String(254), nullable=True)
    # Applied while signed in: approval grants the role to this account.
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), _user_fk(), nullable=True, index=True)
    # The organisation whose ORG-01 code was entered (no FK across domains, like invites.org_id).
    org_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)  # pending | approved | rejected
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # the team's own note on a rejection; never shown to the applicant
    invite_code: Mapped[str | None] = mapped_column(String(32), nullable=True)  # issued on approval, sent by hand
