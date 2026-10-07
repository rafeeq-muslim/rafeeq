"""PLT-02 optional account: sign-up, sign-in, optional email 2FA, sessions,
account deletion. Roles beyond learner come only from team invites."""

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select, update

from app.core import ratelimit
from app.core.config import get_settings
from app.core.deps import CurrentUser, Session
from app.core.events import OutboxEvent, publish
from app.core.security import (
    create_access_token,
    hash_password,
    new_opaque_token,
    new_otp,
    sha256,
    verify_password,
)
from app.platform import generate, mailer
from app.platform.models import Invite, OneTimeCode, PushSubscription, RefreshSession, User
from app.platform.origin import SameOrigin

router = APIRouter(prefix="/api/auth", tags=["auth"])
COOKIE = "rafeeq_refresh"
_DUMMY_HASH = hash_password("rafeeq-timing-equaliser")


async def _revoke_other_sessions(session, user, response: Response) -> None:
    """Security review #8: a password or two-step change ends every signed-in
    device; the device that made the change gets a fresh refresh cookie. (The
    cookie is scoped to /api/auth, so /api/me never sees the old one.)"""
    await session.execute(delete(RefreshSession).where(RefreshSession.user_id == user.id))
    await _issue(session, user, response)


USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,38}[a-z0-9]$")
Locale = Literal["ar", "en", "tl"]


class Suggestion(BaseModel):
    display_name: str
    username: str
    password: str


class RegisterIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    username: str
    password: str = Field(min_length=8, max_length=128)
    locale: Locale = "ar"
    invite_code: str | None = None
    gender: Literal["m", "f"] | None = None
    languages: list[Locale] = []

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        v = v.strip().lower()
        if not USERNAME_RE.match(v):
            raise ValueError("username_format")
        return v

    @field_validator("display_name")
    @classmethod
    def _display(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("display_name_empty")
        return v


class LoginIn(BaseModel):
    username: str
    password: str


class TwoFactorIn(BaseModel):
    challenge_id: uuid.UUID
    code: str = Field(min_length=6, max_length=6)


class TokenOut(BaseModel):
    access_token: str
    user: "MeOut"
    notice: str | None = None  # MOT-08: e.g. "team_role_db_only" after an old team invite


class LoginOut(BaseModel):
    two_factor_required: bool = False
    challenge_id: uuid.UUID | None = None
    email_hint: str | None = None
    access_token: str | None = None
    user: "MeOut | None" = None


class MeOut(BaseModel):
    id: uuid.UUID
    display_name: str
    username: str
    roles: list[str]
    locale: str
    two_factor_enabled: bool
    email_hint: str | None
    gender: str | None
    languages: list[str]


def _hint(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    name, domain = email.split("@", 1)
    return f"{name[:1]}•••@{domain}"


def me_out(u: User) -> MeOut:
    return MeOut(
        id=u.id,
        display_name=u.display_name,
        username=u.username,
        roles=u.roles,
        locale=u.locale,
        two_factor_enabled=u.two_factor_enabled,
        email_hint=_hint(u.email),
        gender=u.gender,
        languages=u.languages or [],
    )


async def _issue(session: Session, user: User, response: Response) -> TokenOut:
    s = get_settings()
    token, token_hash = new_opaque_token()
    session.add(RefreshSession(user_id=user.id, token_hash=token_hash, expires_at=datetime.now(UTC) + timedelta(days=s.refresh_token_days)))
    user.last_login_at = datetime.now(UTC)
    await session.commit()
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=s.is_production,
        samesite="lax",
        max_age=s.refresh_token_days * 86400,
        path="/api/auth",
    )
    return TokenOut(access_token=create_access_token(user.id, user.roles), user=me_out(user))


@router.get("/suggest", response_model=Suggestion)
async def suggest(locale: Locale = "ar") -> Suggestion:
    """PLT-02 R3: fill any field at random."""
    return Suggestion(display_name=generate.display_name(locale), username=generate.username(), password=generate.password())


@router.get("/username-available")
async def username_available(session: Session, u: str, request: Request) -> dict:
    # Security review #7: without a limit anyone could test a hidden convert's usual handle.
    ratelimit.hit(f"uname:{request.client.host if request.client else '-'}", 30, 600)
    u = u.strip().lower()
    taken = await session.scalar(select(User.id).where(User.username == u))
    return {
        "available": taken is None and bool(USERNAME_RE.match(u)),
        "suggestions": [] if taken is None else [generate.username() for _ in range(3)],
    }


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn, session: Session, request: Request, response: Response) -> TokenOut:
    ratelimit.hit(f"register:{request.client.host if request.client else '-'}", 10, 3600)
    if await session.scalar(select(User.id).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "username_taken", "suggestions": [generate.username() for _ in range(3)]})
    roles = ["learner"]
    invite: Invite | None = None
    if body.invite_code:
        invite = await session.get(Invite, body.invite_code.strip())
        if (
            invite is None
            or invite.used_by is not None
            or invite.revoked_at is not None  # PLT-17 R12
            or (invite.expires_at is not None and invite.expires_at < datetime.now(UTC))
        ):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "invite_invalid")  # ORG-02 R1 ex2: used, revoked or expired
        # MOT-08: the team role is granted only in the database; an invite made
        # for it before that decision still opens a normal account and is used up.
        roles = ["learner"] if invite.role == "team" else [invite.role]
        if invite.role == "mentor" and not body.gender:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "gender_required_for_mentor")
    user = User(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        roles=roles,
        locale=body.locale,
        gender=body.gender,
        languages=body.languages or [body.locale],
    )
    session.add(user)
    await session.flush()
    if invite:
        # Claim atomically: two parallel sign-ups cannot share one invite.
        claimed = await session.execute(
            update(Invite).where(Invite.code == invite.code, Invite.used_by.is_(None)).values(used_by=user.id, used_at=datetime.now(UTC))
        )
        if claimed.rowcount != 1:
            await session.rollback()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "invite_invalid")
    created: dict = {"user_id": str(user.id)}
    if invite and invite.org_id:
        # ORG-02 R1: an organisation's own invite; ORG records the approval.
        created["invite"] = {"role": invite.role, "org_id": str(invite.org_id)}
    await publish(session, "AccountCreated", "PLT", created)
    out = await _issue(session, user, response)
    if invite and invite.role == "team":
        out.notice = "team_role_db_only"
    return out


@router.post("/login", response_model=LoginOut)
async def login(body: LoginIn, session: Session, request: Request, response: Response) -> LoginOut:
    ip = request.client.host if request.client else "-"
    ratelimit.hit(f"login:{ip}", 30, 600)
    ratelimit.hit(f"login-user:{body.username.strip().lower()}", 8, 600)
    user = await session.scalar(select(User).where(User.username == body.username.strip().lower()))
    if user is None:
        verify_password(_DUMMY_HASH, body.password)  # same cost as a real check: no timing hint that an account exists
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")
    if not verify_password(user.password_hash, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")
    if user.two_factor_enabled and user.email:
        challenge = await _send_code(session, user, "login", user.email)
        return LoginOut(two_factor_required=True, challenge_id=challenge, email_hint=_hint(user.email))
    out = await _issue(session, user, response)
    return LoginOut(access_token=out.access_token, user=out.user)


async def _send_code(session: Session, user: User, purpose: str, email: str) -> uuid.UUID:
    code = new_otp()
    otp = OneTimeCode(
        user_id=user.id,
        purpose=purpose,
        code_hash=sha256(code),
        pending_email=email if purpose == "enable_2fa" else None,
        expires_at=datetime.now(UTC) + timedelta(minutes=10),
    )
    session.add(otp)
    await session.commit()
    if not await mailer.send_code(email, code, user.locale):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "email_unavailable")
    return otp.id


async def _check_code(session: Session, challenge_id: uuid.UUID, code: str, purpose: str) -> OneTimeCode:
    otp = await session.get(OneTimeCode, challenge_id)
    if otp is None or otp.purpose != purpose or otp.used_at or otp.expires_at < datetime.now(UTC) or otp.attempts >= 5:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "code_expired")
    otp.attempts += 1
    if otp.code_hash != sha256(code):
        await session.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "code_invalid")
    otp.used_at = datetime.now(UTC)
    return otp


@router.post("/login/2fa", response_model=TokenOut)
async def login_2fa(body: TwoFactorIn, session: Session, response: Response) -> TokenOut:
    ratelimit.hit(f"2fa:{body.challenge_id}", 6, 600)
    otp = await _check_code(session, body.challenge_id, body.code, "login")
    user = await session.get(User, otp.user_id)
    assert user is not None
    return await _issue(session, user, response)


@router.post("/refresh", response_model=TokenOut, dependencies=[SameOrigin])
async def refresh(session: Session, response: Response, rafeeq_refresh: Annotated[str | None, Cookie()] = None) -> TokenOut:
    if not rafeeq_refresh:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no_session")
    rs = await session.scalar(select(RefreshSession).where(RefreshSession.token_hash == sha256(rafeeq_refresh)))
    if rs is None or rs.expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no_session")
    user = await session.get(User, rs.user_id)
    assert user is not None
    await session.delete(rs)  # rotate
    return await _issue(session, user, response)


@router.post("/logout", status_code=204, dependencies=[SameOrigin])
async def logout(session: Session, response: Response, rafeeq_refresh: Annotated[str | None, Cookie()] = None) -> None:
    if rafeeq_refresh:
        rs = await session.scalar(select(RefreshSession).where(RefreshSession.token_hash == sha256(rafeeq_refresh)))
        if rs is not None:
            # Signed out: this account's push subscriptions stop receiving its
            # replies; reminders keep working for the device (re-linked on sign-in).
            await session.execute(update(PushSubscription).where(PushSubscription.user_id == rs.user_id).values(user_id=None))
            await session.delete(rs)
        await session.commit()
    response.delete_cookie(COOKIE, path="/api/auth")


# ---- the signed-in user --------------------------------------------------

me = APIRouter(prefix="/api/me", tags=["me"])

# CMP-01 R3 / CMP-02 R1: responders see requests of their own gender only, so
# once a mentor or team member has a gender, only an admin changes it
# (PUT /api/admin/users/{id}/gender); otherwise one could switch to read the
# other gender's requests.
GENDER_LOCKED_ROLES = ("mentor", "team", "admin")


def set_own_gender(user: User, gender: str) -> None:
    if user.gender and gender != user.gender and any(user.has(r) for r in GENDER_LOCKED_ROLES):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "gender_locked")
    user.gender = gender


class MePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    locale: Locale | None = None
    languages: list[Locale] | None = None
    gender: Literal["m", "f"] | None = None  # mentors and team members set theirs in «حسابي»


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class EnableTwoFactorIn(BaseModel):
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ConfirmIn(BaseModel):
    challenge_id: uuid.UUID
    code: str = Field(min_length=6, max_length=6)


@me.get("", response_model=MeOut)
async def get_me(user: CurrentUser) -> MeOut:
    return me_out(user)


@me.patch("", response_model=MeOut)
async def patch_me(body: MePatch, user: CurrentUser, session: Session) -> MeOut:
    if body.display_name:
        user.display_name = " ".join(body.display_name.split())
    if body.locale:
        user.locale = body.locale
    if body.languages is not None:
        user.languages = body.languages
    if body.gender is not None:
        set_own_gender(user, body.gender)
    await session.commit()
    return me_out(user)


@me.post("/password", status_code=204)
async def change_password(body: PasswordIn, user: CurrentUser, session: Session, response: Response) -> None:
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid_credentials")
    user.password_hash = hash_password(body.new_password)
    await _revoke_other_sessions(session, user, response)
    await session.commit()


@me.get("/2fa/available")
async def two_factor_available() -> dict:
    return {"available": mailer.email_configured()}


@me.post("/2fa/start")
async def start_2fa(body: EnableTwoFactorIn, user: CurrentUser, session: Session) -> dict:
    ratelimit.hit(f"2fa-start:{user.id}", 5, 3600)
    challenge = await _send_code(session, user, "enable_2fa", body.email.strip())
    return {"challenge_id": challenge}


@me.post("/2fa/confirm", response_model=MeOut)
async def confirm_2fa(body: ConfirmIn, user: CurrentUser, session: Session, response: Response) -> MeOut:
    otp = await _check_code(session, body.challenge_id, body.code, "enable_2fa")
    if otp.user_id != user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "code_invalid")
    user.email, user.two_factor_enabled = otp.pending_email, True
    await _revoke_other_sessions(session, user, response)
    await session.commit()
    return me_out(user)


@me.delete("/2fa", response_model=MeOut)
async def disable_2fa(user: CurrentUser, session: Session, response: Response) -> MeOut:
    user.email, user.two_factor_enabled = None, False  # the email is kept only for codes
    await _revoke_other_sessions(session, user, response)
    await session.commit()
    return me_out(user)


@me.delete("", status_code=204)
async def delete_account(user: CurrentUser, session: Session, response: Response) -> None:
    """rules.md §4: delete the account and all its data at any time. Domain
    tables cascade on users.id; domains also receive AccountDeleted."""
    await publish(session, "AccountDeleted", "PLT", {"user_id": str(user.id)})
    # Leave no event history that names the account (security review #10).
    await session.execute(delete(OutboxEvent).where(OutboxEvent.payload["user_id"].astext == str(user.id)))
    await session.delete(user)
    await session.commit()
    response.delete_cookie(COOKIE, path="/api/auth")
