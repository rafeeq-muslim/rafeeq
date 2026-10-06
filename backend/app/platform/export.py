"""PLT-05 R6 «نزّل نسخة من بياناتي» (PDPL art. 4): the signed-in person gets
one JSON file with everything Rafeeq keeps about their account, free and in
a clear form. Each domain exposes its own `export_user` (it owns its data);
Platform only puts the parts together.

Never in the file: anything about another person (no other user's name or
id), and no secret: no password hash, session token, one-time code, push
endpoint or keys, guest token, invite or join code. The device's own data
(guest progress, settings, notebook) is added by the app from the device.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.companion.export import export_user as companion_export
from app.core import ratelimit
from app.core.deps import CurrentUser, Session
from app.knowledge.export import export_user as knowledge_export
from app.learning.export import export_user as learning_export
from app.motivation.export import export_user as motivation_export
from app.platform.models import PushSubscription, RefreshSession, User

router = APIRouter(prefix="/api/me", tags=["me"])
FORMAT = "rafeeq-my-data/1"


async def _platform(session: AsyncSession, user: User) -> dict:
    sessions = await session.scalars(select(RefreshSession).where(RefreshSession.user_id == user.id).order_by(RefreshSession.created_at))
    subs = await session.scalars(select(PushSubscription).where(PushSubscription.user_id == user.id).order_by(PushSubscription.created_at))
    return {
        "account": {
            "display_name": user.display_name,
            "username": user.username,
            "roles": user.roles,
            "language": user.locale,
            "languages_spoken": user.languages or [],
            "gender": user.gender,
            "two_step_sign_in": user.two_factor_enabled,
            "email_for_codes": user.email,
            "created_at": user.created_at,
            "last_sign_in_at": user.last_login_at,
        },
        "signed_in_devices": [{"since": s.created_at, "until": s.expires_at} for s in sessions],
        "notifications": [
            {
                "since": s.created_at,
                "language": s.locale,
                "timezone": s.timezone,
                "learning_reminder": s.reminder_enabled,
                "reminder_time": s.reminder_time,
                "replies": s.replies_enabled,
                "last_reminder_on": s.last_reminder_on,
                "last_learned_on": s.last_learned_on,
            }
            for s in subs
        ],
    }


async def export_account(session: AsyncSession, user_id: uuid.UUID) -> dict:
    user = await session.get(User, user_id)
    assert user is not None
    return {
        "format": FORMAT,
        "exported_at": datetime.now(UTC),
        **await _platform(session, user),
        "learning": await learning_export(session, user.id),
        "motivation": await motivation_export(session, user.id),
        "companion": await companion_export(session, user.id),
        "knowledge": await knowledge_export(session, user.id),
    }


@router.get("/export")
async def export_my_data(user: CurrentUser, session: Session) -> JSONResponse:
    ratelimit.hit(f"export:{user.id}", 10, 3600)
    data = jsonable_encoder(await export_account(session, user.id))
    name = f"rafeeq-my-data-{datetime.now(UTC).date().isoformat()}.json"
    return JSONResponse(data, headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})
