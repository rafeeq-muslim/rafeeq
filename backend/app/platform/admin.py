"""Team administration: invite codes for mentors, reviewers and team members,
and role changes. Admin only."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import ARRAY, String, cast, func, select

from app.core.deps import Session, require_role
from app.core.events import publish
from app.platform.models import ROLES, Invite, User

router = APIRouter(prefix="/api/admin", tags=["admin"])
Admin = Annotated[User, Depends(require_role("admin"))]


class InviteIn(BaseModel):
    role: Literal["mentor", "sharia_reviewer", "team", "admin"]
    count: int = 1
    gender: Literal["m", "f"] | None = None  # required for a mentor (security review B-H1)


# MOT-08 (open question decided 2026-10-06): the team role is granted only in
# the database, never from the app; holding or revoking it still works.
TEAM_ROLE_DB_ONLY = "team_role_db_only"

# PLT-17 R11: an admin never drops their own admin role, and Rafeeq always
# keeps at least one admin.
OWN_ADMIN_ROLE = "cannot_remove_own_admin"
LAST_ADMIN = "last_admin"

# PLT-17 R12: codes made here end after seven days (open question default,
# like an organisation's codes); an unused one can be revoked.
ADMIN_INVITE_DAYS = 7


def invite_status(i: Invite, now: datetime | None = None) -> str:
    if i.used_by is not None:
        return "used"
    if i.revoked_at is not None:
        return "revoked"
    if i.expires_at is not None and i.expires_at < (now or datetime.now(UTC)):
        return "expired"
    return "available"


GENDER_REQUIRED = "gender_required_for_mentor"


def new_invite(
    session,
    role: str,
    created_by: uuid.UUID,
    org_id: uuid.UUID | None = None,
    expires_at: datetime | None = None,
    gender: str | None = None,
) -> Invite:
    """One one-time code for `role`, added to the session (the caller commits).
    Also used by CMP-08 when an application is approved and by ORG-02 for an
    organisation's codes. A mentor's code carries the gender staff approved
    (security review B-H1): the same-gender rule (CMP-01 R3) must not rest on
    what the registrant types."""
    if role == "mentor" and gender not in ("m", "f"):
        raise HTTPException(400, GENDER_REQUIRED)
    code = f"{role[:3].upper()}-{secrets.token_urlsafe(16)}"  # security audit M5: 128 random bits; 26 chars fit String(32)
    invite = Invite(
        code=code, role=role, created_by=created_by, org_id=org_id, expires_at=expires_at, gender=gender if role == "mentor" else None
    )
    session.add(invite)
    return invite


@router.post("/invites")
async def create_invites(body: InviteIn, admin: Admin, session: Session) -> dict:
    if body.role == "team":
        raise HTTPException(403, TEAM_ROLE_DB_ONLY)
    codes = []
    ends = datetime.now(UTC) + timedelta(days=ADMIN_INVITE_DAYS)
    for _ in range(max(1, min(body.count, 50))):
        codes.append(new_invite(session, body.role, admin.id, expires_at=ends, gender=body.gender).code)
    await session.commit()
    return {"codes": codes, "expires_at": ends}


@router.get("/invites")
async def list_invites(admin: Admin, session: Session) -> list[dict]:
    rows = (await session.scalars(select(Invite).order_by(Invite.created_at.desc()).limit(200))).all()
    now = datetime.now(UTC)
    return [
        {
            "code": i.code,
            "role": i.role,
            "gender": i.gender,
            "used": i.used_by is not None,
            "status": invite_status(i, now),
            "expires_at": i.expires_at,
            "created_at": i.created_at,
        }
        for i in rows
    ]


@router.post("/invites/{code}/revoke")
async def revoke_invite(code: str, admin: Admin, session: Session) -> dict:
    """PLT-17 R12: an unused code is cancelled; it is then refused at sign-up."""
    invite = await session.get(Invite, code)
    if invite is None:
        raise HTTPException(404, "not_found")
    if invite.used_by is not None:
        raise HTTPException(409, "invite_used")
    if invite.revoked_at is None:
        invite.revoked_at = datetime.now(UTC)
        await session.commit()
    return {"code": invite.code, "status": "revoked"}


class RolesIn(BaseModel):
    roles: list[str]


@router.put("/users/{user_id}/roles")
async def set_roles(user_id: uuid.UUID, body: RolesIn, admin: Admin, session: Session) -> dict:
    if any(r not in ROLES for r in body.roles):
        raise HTTPException(400, "unknown_role")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "not_found")
    if "team" in body.roles and "team" not in (user.roles or []):
        raise HTTPException(403, TEAM_ROLE_DB_ONLY)
    if "admin" in (user.roles or []) and "admin" not in body.roles:
        if user.id == admin.id:
            raise HTTPException(409, OWN_ADMIN_ROLE)
        others = await session.scalar(
            select(func.count()).select_from(User).where(User.roles.op("&&")(cast(["admin"], ARRAY(String(20)))), User.id != user.id)
        )
        if not others:
            raise HTTPException(409, LAST_ADMIN)
    was_mentor = "mentor" in (user.roles or [])
    user.roles = body.roles or ["learner"]
    if was_mentor and "mentor" not in user.roles:
        # He is nobody's mentor any more: Companion ends his links and returns
        # his open requests to the pool, as for a suspension (CMP-03 R4).
        await publish(session, "MentorRoleRemoved", "PLT", {"mentor_id": str(user.id)})
    await session.commit()
    return {"id": str(user.id), "roles": user.roles}


class GenderIn(BaseModel):
    gender: Literal["m", "f"]


@router.put("/users/{user_id}/gender")
async def set_gender(user_id: uuid.UUID, body: GenderIn, admin: Admin, session: Session) -> dict:
    """CMP security: a mentor's or team member's gender (it decides which
    requests they see) changes only here, by an admin."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "not_found")
    user.gender = body.gender
    await session.commit()
    return {"id": str(user.id), "gender": user.gender}


@router.get("/users")
async def find_users(admin: Admin, session: Session, username: str) -> list[dict]:
    prefix = username.lower().replace("\\", "").replace("%", "").replace("_", "\\_")
    rows = (await session.scalars(select(User).where(User.username.ilike(f"{prefix}%", escape="\\")).limit(20))).all()
    return [{"id": str(u.id), "username": u.username, "display_name": u.display_name, "roles": u.roles, "gender": u.gender} for u in rows]
