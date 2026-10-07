"""Platform (PLT): accounts, sessions, one-time codes, invites, push subscriptions."""

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin

ROLES = ("learner", "mentor", "sharia_reviewer", "team", "admin", "org_coordinator")


class User(IdMixin, TimestampMixin, Base):
    """PLT-02: display name, username and password only. Email exists solely
    for optional two-factor codes."""

    __tablename__ = "users"
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(40))
    password_hash: Mapped[str] = mapped_column(String(255))
    roles: Mapped[list[str]] = mapped_column(ARRAY(String(20)), default=lambda: ["learner"])
    locale: Mapped[str] = mapped_column(String(5), default="ar")
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Mentors and group members only (CMP-03, CMP-05: same-gender matching).
    gender: Mapped[str | None] = mapped_column(String(1), nullable=True)
    languages: Mapped[list[str]] = mapped_column(ARRAY(String(5)), default=list)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Security audit L7: access tokens issued before it are refused. NULL = never changed.
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def has(self, role: str) -> bool:
        return role in (self.roles or [])


class RefreshSession(IdMixin, TimestampMixin, Base):
    __tablename__ = "refresh_sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OneTimeCode(IdMixin, TimestampMixin, Base):
    """Email codes for 2FA sign-in and for confirming a 2FA email."""

    __tablename__ = "one_time_codes"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(16))  # login | enable_2fa
    code_hash: Mapped[str] = mapped_column(String(64))
    pending_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Invite(TimestampMixin, Base):
    """One-time codes that grant a role at sign-up. Issued by the team
    (mentor, reviewer, team, admin; no expiry; kept for "Rafeeq" mentors
    without an organisation, ORG-02 open question) or for an organisation
    (ORG-02 R1: its mentors, valid 7 days; its coordinators, issued by the team)."""

    __tablename__ = "invites"
    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    role: Mapped[str] = mapped_column(String(20))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    used_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # ORG-02 R1: the organisation that approves the person, and the code's end.
    org_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # PLT-17 R12: an unused code the admin cancelled.
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Security review B-H1: the gender staff approved for a mentor (CMP-01 R3).
    # It becomes the account's gender at sign-up, whatever the registrant sends.
    # Null on codes made before this column: the registrant states it.
    gender: Mapped[str | None] = mapped_column(String(1), nullable=True)


class PushSubscription(IdMixin, TimestampMixin, Base):
    """PLT-06 + MOT-05. Holds the device endpoint and the reminder the learner
    chose. Never stores anything religious; texts are neutral."""

    __tablename__ = "push_subscriptions"
    endpoint: Mapped[str] = mapped_column(String(1024), unique=True)
    p256dh: Mapped[str] = mapped_column(String(255))
    auth: Mapped[str] = mapped_column(String(255))
    install_id: Mapped[str | None] = mapped_column(String(64), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    locale: Mapped[str] = mapped_column(String(5), default="ar")
    # MOT-05 reminder: off until the learner turns it on.
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    reminder_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "21:00" local
    # PLT-06 R2: replies from a human (CMP) have their own switch, off until turned on.
    replies_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Riyadh")
    ignored_in_row: Mapped[int] = mapped_column(Integer, default=0)
    last_reminder_on: Mapped[str | None] = mapped_column(String(10), nullable=True)  # local date
    last_learned_on: Mapped[str | None] = mapped_column(String(10), nullable=True)  # local date
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
