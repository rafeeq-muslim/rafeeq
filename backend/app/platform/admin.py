"""Team administration: invite codes for mentors, reviewers and team members,
and role changes. Admin only."""

import secrets
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import Session, require_role
from app.platform.models import ROLES, Invite, User

router = APIRouter(prefix="/api/admin", tags=["admin"])
Admin = Annotated[User, Depends(require_role("admin"))]


class InviteIn(BaseModel):
    role: Literal["mentor", "sharia_reviewer", "team", "admin"]
    count: int = 1


# MOT-08 (open question decided 2026-10-06): the team role is granted only in
# the database, never from the app; holding or revoking it still works.
TEAM_ROLE_DB_ONLY = "team_role_db_only"


@router.post("/invites")
async def create_invites(body: InviteIn, admin: Admin, session: Session) -> dict:
    if body.role == "team":
        raise HTTPException(403, TEAM_ROLE_DB_ONLY)
    codes = []
    for _ in range(max(1, min(body.count, 50))):
        code = f"{body.role[:3].upper()}-{secrets.token_hex(4).upper()}"
        session.add(Invite(code=code, role=body.role, created_by=admin.id))
        codes.append(code)
    await session.commit()
    return {"codes": codes}


@router.get("/invites")
async def list_invites(admin: Admin, session: Session) -> list[dict]:
    rows = (await session.scalars(select(Invite).order_by(Invite.created_at.desc()).limit(200))).all()
    return [{"code": i.code, "role": i.role, "used": i.used_by is not None, "created_at": i.created_at} for i in rows]


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
    user.roles = body.roles or ["learner"]
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
