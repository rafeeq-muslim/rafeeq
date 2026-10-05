"""Companion & Community (CMP): help requests to a human, mentors, groups,
reports and blocks. A mentor sees only what the learner allows."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin

_user_fk = lambda: ForeignKey("users.id", ondelete="CASCADE")  # noqa: E731


class MentorProfile(Base):
    __tablename__ = "cmp_mentor_profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    capacity: Mapped[int] = mapped_column(Integer, default=8)  # Osool p.102: 5–10 per mentor
    about: Mapped[str] = mapped_column(Text, default="")
    availability: Mapped[str] = mapped_column(String(120), default="")
    accepting: Mapped[bool] = mapped_column(Boolean, default=True)


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
    prefer_gender: Mapped[str | None] = mapped_column(String(1), nullable=True)
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
    author: Mapped[str] = mapped_column(String(8))  # learner | mentor | system
    author_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Group(IdMixin, Base):
    """CMP-05: small, same-gender, same-language, with a mentor."""

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
    reason: Mapped[str] = mapped_column(String(24))  # marriage | money | recruitment | abuse | other | mentor_hidden
    priority: Mapped[str] = mapped_column(String(6), default="normal")  # high | normal
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
