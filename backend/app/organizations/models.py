"""Organisations (ORG): da'wa offices and associations approved by the
Rafeeq team, their codes, coordinators and mentors, the learner's revocable
link, and frozen daily dashboard figures.

Linking someone to the office where they became Muslim is sensitive data
twice over (PDPL art. 1: religious belief, membership of an association;
research/10). So a link exists only after an explicit «نعم» (ORG-01 R2),
holds the least possible (organisation, the code's language, the device's
random install ID, when, and the MOT-07 status copy; never the account), and goes entirely when the learner unlinks (ORG-01 R4). Organisations
only ever see aggregated figures (ORG-03).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import ARRAY, BigInteger, Boolean, Date, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin

_org_fk = lambda: ForeignKey("org_organizations.id", ondelete="CASCADE")  # noqa: E731
_user_fk = lambda: ForeignKey("users.id", ondelete="CASCADE")  # noqa: E731


class Organization(IdMixin, TimestampMixin, Base):
    """Created by the Rafeeq team after checking the organisation is licensed
    (ORG-01 open question, default until decided)."""

    __tablename__ = "org_organizations"
    name: Mapped[str] = mapped_column(String(80))
    languages: Mapped[list[str]] = mapped_column(ARRAY(String(5)))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class OrgCode(TimestampMixin, Base):
    """ORG-01 R1: one code (and so one link and one QR) per organisation and
    language, for everyone; nothing in it is about a person."""

    __tablename__ = "org_codes"
    __table_args__ = (UniqueConstraint("org_id", "lang"),)
    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _org_fk(), index=True)
    lang: Mapped[str] = mapped_column(String(5))


class OrgMember(Base):
    """Coordinators (`coordinator`) and the mentors the organisation approved
    (`mentor`, ORG-02 R1). One organisation per person."""

    __tablename__ = "org_members"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _user_fk(), primary_key=True)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _org_fk(), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # coordinator | mentor
    status: Mapped[str] = mapped_column(String(10), default="active")  # active | suspended
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrgLink(IdMixin, Base):
    """ORG-01: the learner's explicit consent to be counted in one
    organisation's numbers. One at a time (R4). Held against the device's
    random install ID only (the subject of MOT-07), never the account, so the
    server never ties a username to an office. Deleted, with its history,
    the moment the learner unlinks, erases the device or deletes the account."""

    __tablename__ = "org_links"
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _org_fk(), index=True)
    install_id: Mapped[str] = mapped_column(String(64), unique=True)
    lang: Mapped[str] = mapped_column(String(5))  # the code's language: the only split (ORG-03 R5)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str | None] = mapped_column(String(12), nullable=True)  # copy of MOT-07


class OrgLinkStatus(Base):
    """MOT-07 status changes of a linked learner since linking, so ORG-03 can
    tell the status 30 and 90 days after linking and who returned. Goes with
    the link."""

    __tablename__ = "org_link_statuses"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    link_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("org_links.id", ondelete="CASCADE"), index=True)
    status: Mapped[str | None] = mapped_column(String(12), nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OrgSnapshot(Base):
    """ORG-03 R6: the dashboard's figures as computed at 00:10 Asia/Riyadh,
    already aggregated and suppressed; never recomputed."""

    __tablename__ = "org_daily_snapshots"
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _org_fk(), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    figures: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
