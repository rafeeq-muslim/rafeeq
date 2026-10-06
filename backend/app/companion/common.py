"""Shared CMP helpers: who owns a help request (account or guest device),
blocks, and small constants."""

import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import ARRAY, String, and_, cast, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.companion.models import Block, HelpRequest, MentorProfile
from app.core.deps import OptionalUser
from app.core.security import sha256
from app.platform.models import User

Lang = Literal["ar", "en", "tl"]
Gender = Literal["m", "f"]
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")


def now() -> datetime:
    return datetime.now(UTC)


def new_guest_token() -> str:
    return secrets.token_urlsafe(32)


def guest_handle() -> str:
    """A short neutral number shown as «زائر 4821» (CMP-02 R5)."""
    return f"{secrets.randbelow(9000) + 1000}"


@dataclass
class Owner:
    """The person asking for help: an account, or a guest device holding a
    token whose hash is stored (CMP-01 R2)."""

    user: User | None
    token_hash: str | None

    @property
    def anonymous(self) -> bool:
        return self.user is None and self.token_hash is None

    def owns(self, req: HelpRequest) -> bool:
        if self.user is not None and req.learner_id == self.user.id:
            return True
        return self.token_hash is not None and req.guest_token_hash == self.token_hash

    def clause(self):
        """SQL filter for this owner's requests."""
        parts = []
        if self.user is not None:
            parts.append(HelpRequest.learner_id == self.user.id)
        if self.token_hash is not None:
            parts.append(HelpRequest.guest_token_hash == self.token_hash)
        return or_(*parts) if parts else HelpRequest.id.is_(None)


def token_hash_of(token: str | None) -> str | None:
    if token and TOKEN_RE.match(token):
        return sha256(token)
    return None


async def owner_dep(user: OptionalUser, x_help_token: Annotated[str | None, Header()] = None) -> Owner:
    return Owner(user=user, token_hash=token_hash_of(x_help_token))


CurrentOwner = Annotated[Owner, Depends(owner_dep)]


def blocked_by_owner_clause(mentor_id: uuid.UUID):
    """True when the request's owner blocked this mentor (CMP-04 R5)."""
    return exists().where(
        Block.blocked_id == mentor_id,
        or_(
            and_(Block.blocker_id.is_not(None), Block.blocker_id == HelpRequest.learner_id),
            and_(Block.blocker_guest_hash.is_not(None), Block.blocker_guest_hash == HelpRequest.guest_token_hash),
        ),
    )


async def is_blocked(session: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> bool:
    """Either account blocked the other."""
    return bool(
        await session.scalar(
            select(Block.id)
            .where(or_(and_(Block.blocker_id == a, Block.blocked_id == b), and_(Block.blocker_id == b, Block.blocked_id == a)))
            .limit(1)
        )
    )


RESPONDER_ROLES = ("mentor", "team", "admin")


def is_team(user: User) -> bool:
    return user.has("team") or user.has("admin")


def langs_of(user: User) -> list[str]:
    return user.languages or [user.locale]


async def is_paused(session: AsyncSession, user: User) -> bool:
    """CMP-02 R4: a mentor who paused takes no new requests from the pool.
    Team members have no pause."""
    if is_team(user) or not user.has("mentor"):
        return False
    prof = await session.get(MentorProfile, user.id)
    return prof is not None and not prof.accepting


async def same_gender_available(session: AsyncSession, gender: str | None, lang: str) -> bool:
    """CMP-01 R3 ex3: is someone of this gender who speaks `lang` taking
    requests now (a mentor who has not paused, or a team member)?"""
    if gender is None:
        return True  # urgent or legacy: anyone answers
    team = User.roles.op("&&")(cast(["team", "admin"], ARRAY(String(20))))
    speaks = or_(
        User.languages.op("@>")(cast([lang], ARRAY(String(5)))),
        and_(func.cardinality(User.languages) == 0, User.locale == lang),
    )
    found = await session.scalar(
        select(User.id)
        .outerjoin(MentorProfile, MentorProfile.user_id == User.id)
        .where(
            User.roles.op("&&")(cast(list(RESPONDER_ROLES), ARRAY(String(20)))),
            User.gender == gender,
            speaks,
            or_(team, MentorProfile.user_id.is_(None), MentorProfile.accepting.is_(True)),
        )
        .limit(1)
    )
    return found is not None


def forbidden(detail: str = "forbidden") -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail)


def not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
