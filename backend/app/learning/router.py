"""Learning API: the path's content (LRN-01) for one language."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import OptionalUser, Session
from app.knowledge.review import published
from app.learning.content import build_content

router = APIRouter(prefix="/api", tags=["learning"])
PREVIEW_ROLES = ("team", "sharia_reviewer", "admin")


@router.get("/content")
async def content(
    session: Session, user: OptionalUser, response: Response, lang: Literal["ar", "en", "tl"] = "ar", preview: bool = False
) -> dict:
    if preview and not (user and any(user.has(r) for r in PREVIEW_ROLES)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "preview_requires_team")
    units_live = await published(session, "unit", lang)
    lessons_live = await published(session, "lesson", lang)
    # Guests cache it for offline use (the service worker revalidates); previews are personal.
    response.headers["Cache-Control"] = "private, no-store" if preview else "public, max-age=60"
    return build_content(lang, units_live, lessons_live, preview)
