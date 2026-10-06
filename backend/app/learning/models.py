"""Learning (LRN). Lesson content itself is versioned in `content/` and loaded
at start-up; the database holds account copies of progress (guests keep
theirs on the device). Approvals of lesson text live in Knowledge (KNW-05)."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

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
    # LRN-04 R2: exercises already answered, so review prefers an unseen one on any device.
    seen_exercises: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)


class ExplanationBlock(Base):
    """LRN-03 R6: the reviewer can block AI explanations for one exercise."""

    __tablename__ = "lrn_explanation_blocks"
    exercise_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    lang: Mapped[str] = mapped_column(String(5), primary_key=True)
    blocked_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
