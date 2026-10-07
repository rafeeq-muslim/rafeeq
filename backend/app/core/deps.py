"""Request dependencies: database session and the signed-in user."""

import uuid
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import decode_access_token
from app.platform.models import User

Session = Annotated[AsyncSession, Depends(get_session)]


async def optional_user(session: Session, authorization: str | None = Header(default=None)) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        payload = decode_access_token(authorization.split(" ", 1)[1])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token") from None
    user = await session.get(User, uuid.UUID(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token")
    # Security audit L7: a token issued before the last password change is no
    # longer accepted. `iat` has whole seconds, so the change is floored too:
    # the token the app gets by refreshing right after the change must pass.
    changed = user.password_changed_at
    if changed is not None and int(payload.get("iat", 0)) < int(changed.timestamp()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token")
    return user


async def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign_in_required")
    return user


def require_role(*roles: str):
    async def dep(user: Annotated[User, Depends(current_user)]) -> User:
        if not any(user.has(r) for r in roles) and not user.has("admin"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
        return user

    return dep


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]
