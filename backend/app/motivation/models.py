"""Motivation (MOT): streak days, badges, anonymous learning events,
engagement status, daily snapshots, group challenges. No points, no ranking."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin

_user_fk = lambda: ForeignKey("users.id", ondelete="CASCADE")  # noqa: E731


class StreakDay(Base):
    """MOT-02: a counted learning day (device local date). Never removed."""

    __tablename__ = "mot_streak_days"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)


class EarnedBadge(Base):
    """MOT-03: unit badges and 7/30/66-day consistency badges, once each."""

    __tablename__ = "mot_badges"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    badge_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LearningLog(IdMixin, Base):
    """Account learning interactions for group challenges (MOT-06)."""

    __tablename__ = "mot_learning_log"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), index=True)
    kind: Mapped[str] = mapped_column(String(8))  # lesson | unit | day (a learning day, reviews included)
    item_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_repeat: Mapped[bool] = mapped_column(Boolean, default=False)
    day: Mapped[date] = mapped_column(Date)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AnonEvent(Base):
    """MOT-07 R4 / MOT-09: anonymous learning events. No IP, no question text.
    `install_id` is cleared when the device opts out (MOT-07 R4)."""

    __tablename__ = "mot_anon_events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    install_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    lesson_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    unit_id: Mapped[str | None] = mapped_column(String(8), nullable=True)
    objective_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    exercise_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    context: Mapped[str | None] = mapped_column(String(16), nullable=True)  # lesson | review | placement | quick_check
    # ai_explanation | card_holdout (MOT-09 R4 random fifth) | card_only (offline, failed or refused)
    shown: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_repeat: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    value: Mapped[int | None] = mapped_column(Integer, nullable=True)  # e.g. units passed in placement
    day: Mapped[date] = mapped_column(Date, index=True)
    # MOT-09 R4: the device's own order of its events (a counter), so an
    # offline queue arriving at once keeps "what came after «لماذا؟»".
    seq: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EngagementState(Base):
    """MOT-07: one status per subject (install ID), learning interactions only."""

    __tablename__ = "mot_engagement"
    install_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str | None] = mapped_column(String(12), nullable=True)
    first_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DailySnapshot(Base):
    """MOT-08 R2: counts per status at 00:00 Asia/Riyadh; never recomputed."""

    __tablename__ = "mot_daily_snapshots"
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    counts: Mapped[dict] = mapped_column(JSONB)
    transitions: Mapped[dict] = mapped_column(JSONB, default=dict)  # subject -> status, for rates
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReleaseMarker(IdMixin, Base):
    """MOT-08 R5: dated release markers shown on the indicators."""

    __tablename__ = "mot_release_markers"
    day: Mapped[date] = mapped_column(Date)
    label: Mapped[str] = mapped_column(String(120))


class GroupMembership(Base):
    """Motivation's copy of group membership from GroupJoined / GroupLeft."""

    __tablename__ = "mot_group_members"
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    # From GroupCreated: the group's mentor (sets challenges, never counted).
    is_mentor: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class Challenge(IdMixin, Base):
    """MOT-06: one active challenge per group, 7 days from when it is shown."""

    __tablename__ = "mot_challenges"
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    type: Mapped[str] = mapped_column(String(16))  # lesson | unit | lessons_each | days_each | group_total | free_text
    target_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    target_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    text_lang: Mapped[str | None] = mapped_column(String(5), nullable=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # pending_review | active | rejected | ended
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChallengeCheck(Base):
    """Free-text challenges are self-reported (MOT-06 type 6)."""

    __tablename__ = "mot_challenge_checks"
    challenge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mot_challenges.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)


class ChallengeTemplate(IdMixin, Base):
    """MOT-06 R3: every approved free text becomes a reusable template."""

    __tablename__ = "mot_challenge_templates"
    text: Mapped[str] = mapped_column(Text)
    lang: Mapped[str] = mapped_column(String(5))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
