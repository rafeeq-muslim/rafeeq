"""Learning (LRN). Lesson content itself is versioned in `content/` and loaded
at start-up; the database holds account copies of progress (guests keep
theirs on the device) and the Sharia reviewer's approvals."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin

_user_fk = lambda: ForeignKey("users.id", ondelete="CASCADE")  # noqa: E731


class LessonCompletion(Base):
    """LRN-02: completed lessons of an account (union-merged from devices)."""

    __tablename__ = "lrn_lesson_completions"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    lesson_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    first_completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    times: Mapped[int] = mapped_column(Integer, default=1)


class UnitUnlock(Base):
    """LRN-05 rule 4: units unlocked by the placement test (not completed)."""

    __tablename__ = "lrn_unit_unlocks"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    unit_id: Mapped[str] = mapped_column(String(8), primary_key=True)


class ObjectiveMastery(Base):
    """LRN-10: Bayesian Knowledge Tracing state per objective."""

    __tablename__ = "lrn_objective_mastery"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    objective_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    p: Mapped[float] = mapped_column(Float, default=0.1)
    seen: Mapped[bool] = mapped_column(Boolean, default=False)
    answered: Mapped[bool] = mapped_column(Boolean, default=False)
    last_answer_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mastered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_exercise_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    checks_done: Mapped[int] = mapped_column(Integer, default=0)  # LRN-04: 7- and 30-day rechecks


class ContentApproval(IdMixin, Base):
    """rules.md §1.4 and LRN-01 R6: nothing is shown in a language before the
    Sharia reviewer approves it in that language. One row per item+language;
    `content_hash` ties the approval to the exact text approved (KNW-05 R3)."""

    __tablename__ = "content_approvals"
    __table_args__ = (UniqueConstraint("item_type", "item_id", "lang"),)
    item_type: Mapped[str] = mapped_column(
        String(24)
    )  # lesson | unit | badge | challenge_text | fixed_reply | daily_card | dhikr | library_item
    item_id: Mapped[str] = mapped_column(String(64))
    lang: Mapped[str] = mapped_column(String(5))
    status: Mapped[str] = mapped_column(String(12), default="in_review")  # in_review | approved | returned
    content_hash: Mapped[str] = mapped_column(String(64))
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ExplanationBlock(Base):
    """LRN-03 R6: the reviewer can block AI explanations for one exercise."""

    __tablename__ = "lrn_explanation_blocks"
    exercise_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    lang: Mapped[str] = mapped_column(String(5), primary_key=True)
    blocked_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
