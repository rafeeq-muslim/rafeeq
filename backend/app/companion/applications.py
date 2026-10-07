"""CMP-08 «التقديم كمرشد»: anyone may ask to become a mentor; the team (or
the coordinator of the organisation whose code they entered) decides.

- R1: the form needs no account and collects the least that lets the team
  decide and answer: display name, gender (same-gender rule), languages,
  optional place, a short text, ONE contact (email or phone), and agreement
  to the mentor rules. An applicant who is signed in needs no contact: the
  answer shows in the app.
- R2: one answer for everyone («وصل طلبك»), whether or not the contact
  applied before. A second pending application from the same account
  replaces the first; one that only repeats the contact is not kept and
  changes nothing (security review B-L10). Anti-abuse without third
  parties: a per-IP limit kept in memory only (the IP is never stored) and
  a hidden field that only a script fills.
- R3: the contact is the single exception to "no contact details" in
  Companion: it is read only through the staff endpoints below, never by a
  learner or a mentor. It is encrypted at rest (`contact_enc`, Fernet) with
  a keyed digest (`contact_hmac`) for the "same contact" lookup; the keys
  are their own settings (app/core/crypto.py), not the sign-in secret.
  Without keys in production the form answers 503 `applications_closed`
  and everything else keeps working; a contact that cannot be decrypted
  shows empty. Rows written before encryption stay readable from the plain
  `contact` column until `encrypt_plaintext` moves them (at start, daily,
  or `python -m app.core.crypto migrate`).
- R4/R5: approve issues a one-time mentor invite through the existing
  mechanism (`invites`: the organisation's 7-day code when the application
  named one, a team code otherwise), shown to staff to send by hand; Rafeeq
  sends no email or SMS. An application made from an account grants the
  role to that account instead and publishes MentorApproved, so the mentor
  rules gate and the gender lock apply as for any mentor. Reject deletes
  the contact and the text at once.
- R6: unanswered applications go after 90 days; decided ones 90 days after
  the decision (`purge`, run daily by companion/jobs.py).
- R7: account deletion removes a linked application (events.py) and the
  data export includes it without the team's note (export.py).
- R8: the organisation's active coordinator sees and decides only the
  applications that named their organisation (ORG-02 R1: the organisation
  approves its mentors), without the team's note.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.companion import notify
from app.companion.models import MentorApplication
from app.core import crypto, ratelimit
from app.core.deps import CurrentUser, OptionalUser, Session, require_role
from app.organizations.manage import INVITE_DAYS, coordinator_of
from app.organizations.public import approve_mentor, org_id_of_code, org_names
from app.platform.admin import new_invite
from app.platform.models import Invite, User

KEEP_DAYS = 90  # R6 (open question: 90 days until decided)
ABOUT_MAX = 600
LIMIT, WINDOW_S = 5, 3600  # R2: applications per IP per hour
Lang = Literal["ar", "en", "tl"]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+?[0-9]{7,15}$")

public = APIRouter(prefix="/api/mentor-applications", tags=["mentor-applications"])
staff = APIRouter(prefix="/api/admin/mentor-applications", tags=["mentor-applications"])
org = APIRouter(prefix="/api/org/{org_id}/mentor-applications", tags=["mentor-applications"])
# `team` and `admin` only (require_role always lets an admin in).
Staff = Annotated[User, Depends(require_role("team"))]


def normalize_contact(value: str) -> str:
    """An email (lower-cased) or a phone number (digits, optional +)."""
    v = value.strip()
    if EMAIL_RE.match(v):
        return v.lower()
    phone = re.sub(r"[\s().-]", "", v)
    if PHONE_RE.match(phone):
        return phone
    raise ValueError("contact_format")


class ApplyIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    gender: Literal["m", "f"]
    languages: list[Lang] = Field(min_length=1, max_length=3)
    locale: Lang = "ar"
    place: str | None = Field(default=None, max_length=80)
    about: str = Field(min_length=1, max_length=ABOUT_MAX)
    contact: str | None = Field(default=None, max_length=254)
    rules_accepted: Literal[True]  # the ORG-02 R2 mentor rules, shown in the form
    org_code: str | None = Field(default=None, max_length=32)
    website: str = Field(default="", max_length=200)  # honeypot: hidden from people

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("display_name_empty")
        return v

    @field_validator("about")
    @classmethod
    def _about(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("about_empty")
        return v

    @field_validator("place")
    @classmethod
    def _place(cls, v: str | None) -> str | None:
        return " ".join((v or "").split()) or None

    @field_validator("contact")
    @classmethod
    def _contact(cls, v: str | None) -> str | None:
        return normalize_contact(v) if v and v.strip() else None


class ApplyOut(BaseModel):
    """R2: the same for every submission."""

    received: bool = True
    keep_days: int = KEEP_DAYS


@public.post("", response_model=ApplyOut, status_code=201)
async def apply(body: ApplyIn, session: Session, request: Request, user: OptionalUser) -> ApplyOut:
    ratelimit.hit(f"mentor-apply:{request.client.host if request.client else '-'}", LIMIT, WINDOW_S)  # in memory only
    if body.website:
        return ApplyOut()  # a script filled the hidden field: same answer, nothing kept
    if not crypto.available():
        # The contact keys are not set (production only): nothing is stored in plain text.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "applications_closed")
    if user is None and body.contact is None:
        raise HTTPException(422, "contact_required")
    if user is not None and user.has("mentor"):
        raise HTTPException(status.HTTP_409_CONFLICT, "already_mentor")
    org_id = None
    if body.org_code and body.org_code.strip():
        org_id = await org_id_of_code(session, body.org_code)
        if org_id is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "code_invalid")  # as ORG-01 R3: «تحقق من الرمز»
    pending = MentorApplication.status == "pending"
    # An account's own pending application first: it is the only one it replaces.
    row = await session.scalar(select(MentorApplication).where(pending, MentorApplication.user_id == user.id).limit(1)) if user else None
    if row is None and body.contact:
        # The keyed digest; the plain column only matches a row not encrypted yet.
        same_contact = or_(MentorApplication.contact_hmac == crypto.contact_digest(body.contact), MentorApplication.contact == body.contact)
        taken = await session.scalar(select(MentorApplication.id).where(pending, same_contact).limit(1))
        if taken is not None:
            # Security review B-L10: the contact alone proves nothing. Only the
            # account that made a pending application replaces it; anyone else
            # gets the same answer and the first application stays as it is.
            return ApplyOut()
    is_new = row is None
    if row is None:
        row = MentorApplication(status="pending")
        session.add(row)
    row.display_name = body.display_name
    # A mentor's gender is locked once set (CMP-01 R3): an account's own gender wins.
    row.gender = (user.gender if user is not None and user.gender else None) or body.gender
    row.languages = list(dict.fromkeys(body.languages))
    row.locale = body.locale
    row.place = body.place
    row.about = body.about
    row.set_contact(body.contact)
    row.user_id = user.id if user is not None else row.user_id
    row.org_id = org_id
    row.created_at = datetime.now(UTC)
    await session.commit()
    if is_new:
        notify.later(notify.to_role, ["team", "admin"], "notice", "/mentor-applications")  # neutral (rules.md §4)
    return ApplyOut()


class MineOut(BaseModel):
    status: Literal["pending", "approved", "rejected"]
    applied_at: datetime


async def _mine(session: AsyncSession, user_id: uuid.UUID) -> MentorApplication | None:
    return await session.scalar(
        select(MentorApplication).where(MentorApplication.user_id == user_id).order_by(MentorApplication.created_at.desc()).limit(1)
    )


@public.get("/mine", response_model=MineOut | None)
async def mine(session: Session, user: CurrentUser) -> MineOut | None:
    """The signed-in applicant's own application: its state only."""
    row = await _mine(session, user.id)
    return MineOut(status=row.status, applied_at=row.created_at) if row else None


@public.delete("/mine", status_code=204)
async def withdraw(session: Session, user: CurrentUser) -> None:
    await session.execute(delete(MentorApplication).where(MentorApplication.user_id == user.id))
    await session.commit()


# --- staff: the team and admins -------------------------------------------------


class ApplicationOut(BaseModel):
    id: uuid.UUID
    display_name: str
    gender: str
    languages: list[str]
    locale: str
    place: str | None
    about: str | None
    contact: str | None
    has_account: bool
    organization: str | None
    status: Literal["pending", "approved", "rejected"]
    applied_at: datetime
    decided_at: datetime | None
    note: str | None
    invite_code: str | None
    invite_used: bool
    invite_expires_at: datetime | None


async def _out(session: AsyncSession, rows: list[MentorApplication], with_note: bool = True) -> list[ApplicationOut]:
    names = await org_names(session, {r.org_id for r in rows if r.org_id})
    codes = [r.invite_code for r in rows if r.invite_code]
    invites = {i.code: i for i in await session.scalars(select(Invite).where(Invite.code.in_(codes)))} if codes else {}
    return [
        ApplicationOut(
            id=r.id,
            display_name=r.display_name,
            gender=r.gender,
            languages=r.languages,
            locale=r.locale,
            place=r.place,
            about=r.about,
            contact=r.readable_contact(),
            has_account=r.user_id is not None,
            organization=names.get(r.org_id) if r.org_id else None,
            status=r.status,
            applied_at=r.created_at,
            decided_at=r.decided_at,
            note=r.note if with_note else None,
            invite_code=r.invite_code,
            invite_used=bool(r.invite_code and (inv := invites.get(r.invite_code)) is not None and inv.used_by is not None),
            invite_expires_at=invites[r.invite_code].expires_at if r.invite_code in invites else None,
        )
        for r in rows
    ]


async def _list(session: AsyncSession, org_id: uuid.UUID | None = None) -> list[MentorApplication]:
    q = select(MentorApplication)
    if org_id is not None:
        q = q.where(MentorApplication.org_id == org_id)
    # Pending first (the longest-waiting on top), then the latest decisions.
    pending = MentorApplication.status == "pending"
    q = q.order_by(case((pending, 0), else_=1), case((pending, MentorApplication.created_at)), MentorApplication.decided_at.desc())
    return list(await session.scalars(q.limit(200)))


async def _get(session: AsyncSession, app_id: uuid.UUID, org_id: uuid.UUID | None = None) -> MentorApplication:
    row = await session.get(MentorApplication, app_id)
    if row is None or (org_id is not None and row.org_id != org_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return row


def _pending(row: MentorApplication) -> None:
    if row.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "already_decided")


async def _approve(session: AsyncSession, row: MentorApplication, by: User) -> None:
    _pending(row)
    now = datetime.now(UTC)
    account = await session.get(User, row.user_id) if row.user_id else None
    if account is not None:
        # R5: the account becomes a mentor as it is; nothing to send.
        # Security review B-H1: staff approve the gender written on the
        # application. An account whose gender differs from it now (changed
        # after applying) is not approved, so staff see it; nothing changes.
        if account.gender and account.gender != row.gender:
            raise HTTPException(status.HTTP_409_CONFLICT, "gender_mismatch")
        if not account.has("mentor"):
            account.roles = [*(account.roles or []), "mentor"]
        account.gender = row.gender
        account.languages = list(dict.fromkeys([*(account.languages or []), *row.languages]))
        await approve_mentor(session, account.id, row.org_id)
        notify.later(notify.to_user, account.id, "notice", "/mentor-apply")
    else:
        # R4: the existing one-time invite, sent by hand.
        expires = now + timedelta(days=INVITE_DAYS) if row.org_id else None
        # B-H1: the code carries the approved gender; sign-up uses it, not the registrant's answer.
        row.invite_code = new_invite(session, "mentor", by.id, org_id=row.org_id, expires_at=expires, gender=row.gender).code
    row.status, row.decided_at, row.decided_by = "approved", now, by.id
    await session.commit()


async def _reject(session: AsyncSession, row: MentorApplication, by: User, note: str | None) -> None:
    _pending(row)
    row.status, row.decided_at, row.decided_by = "rejected", datetime.now(UTC), by.id
    row.note = (note or "").strip() or None
    row.about = None  # R4: gone at once
    row.set_contact(None)  # the ciphertext, the digest and any plain text left
    await session.commit()


class RejectIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


@staff.get("", response_model=list[ApplicationOut])
async def list_applications(session: Session, _: Staff) -> list[ApplicationOut]:
    return await _out(session, await _list(session))


@staff.post("/{app_id}/approve", response_model=ApplicationOut)
async def approve(app_id: uuid.UUID, session: Session, me: Staff) -> ApplicationOut:
    row = await _get(session, app_id)
    await _approve(session, row, me)
    return (await _out(session, [row]))[0]


@staff.post("/{app_id}/reject", response_model=ApplicationOut)
async def reject(app_id: uuid.UUID, body: RejectIn, session: Session, me: Staff) -> ApplicationOut:
    row = await _get(session, app_id)
    await _reject(session, row, me, body.note)
    return (await _out(session, [row]))[0]


@staff.delete("/{app_id}", status_code=204)
async def remove(app_id: uuid.UUID, session: Session, _: Staff) -> None:
    await session.delete(await _get(session, app_id))
    await session.commit()


# --- R8: the organisation's coordinator -----------------------------------------


@org.get("", response_model=list[ApplicationOut])
async def org_list(org_id: uuid.UUID, session: Session, user: CurrentUser) -> list[ApplicationOut]:
    await coordinator_of(session, user, org_id)
    return await _out(session, await _list(session, org_id), with_note=False)


@org.post("/{app_id}/approve", response_model=ApplicationOut)
async def org_approve(org_id: uuid.UUID, app_id: uuid.UUID, session: Session, user: CurrentUser) -> ApplicationOut:
    await coordinator_of(session, user, org_id)
    row = await _get(session, app_id, org_id)
    await _approve(session, row, user)
    return (await _out(session, [row], with_note=False))[0]


@org.post("/{app_id}/reject", response_model=ApplicationOut)
async def org_reject(org_id: uuid.UUID, app_id: uuid.UUID, session: Session, user: CurrentUser) -> ApplicationOut:
    await coordinator_of(session, user, org_id)
    row = await _get(session, app_id, org_id)
    await _reject(session, row, user, None)
    return (await _out(session, [row], with_note=False))[0]


# --- R6: retention ---------------------------------------------------------------


async def purge(session: AsyncSession, now: datetime | None = None) -> int:
    """Delete applications unanswered for KEEP_DAYS, and decided ones
    KEEP_DAYS after the decision (their unused invite code stays valid in
    `invites`; only the application, its contact and its text go)."""
    cutoff = (now or datetime.now(UTC)) - timedelta(days=KEEP_DAYS)
    pending = MentorApplication.status == "pending"
    done = await session.execute(
        delete(MentorApplication).where(
            or_(
                pending & (MentorApplication.created_at < cutoff),
                ~pending & (MentorApplication.decided_at < cutoff),
            )
        )
    )
    await session.commit()
    return done.rowcount or 0


# --- R3: contact encryption at rest ------------------------------------------------


async def encrypt_plaintext(session: AsyncSession) -> int:
    """Encrypt contacts still stored as plain text (rows from before the
    encryption, or written by the previous image during a rollback). Safe to
    run any number of times; does nothing without keys. The plain column is
    emptied in the same statement that stores the ciphertext."""
    if not crypto.available():
        return 0
    rows = await session.scalars(select(MentorApplication).where(MentorApplication.contact.is_not(None)).with_for_update(skip_locked=True))
    count = 0
    for row in rows:
        row.set_contact(row.contact)
        count += 1
    await session.commit()
    return count


async def rotate(session: AsyncSession) -> tuple[int, int]:
    """Re-encrypt every contact with the newest key and recompute its digest
    (so the digest key can change in the same run). Returns (re-encrypted,
    unreadable); an unreadable row is left as it is."""
    await encrypt_plaintext(session)
    rows = await session.scalars(select(MentorApplication).where(MentorApplication.contact_enc.is_not(None)).with_for_update())
    done = unreadable = 0
    for row in rows:
        value = crypto.decrypt(row.contact_enc)
        if value is None:
            unreadable += 1
            continue
        row.set_contact(value)
        done += 1
    await session.commit()
    return done, unreadable
