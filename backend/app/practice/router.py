"""Practice API. Only content that is the same for every learner lives here:
approved adhkar (PRC-07), approved short Sharia lines (PRC-01 R5, PRC-04 R2)
and moon-sighting announcements (PRC-04 R2). No endpoint accepts a city,
coordinates, time zone or prayer time (rules.md §4)."""

import json
from datetime import date
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, HttpUrl

from app.core.config import get_settings
from app.core.deps import Session, require_role
from app.knowledge import review
from app.knowledge.review import ReviewItem
from app.platform.models import User
from app.practice import adhkar, sightings

router = APIRouter(prefix="/api/practice", tags=["practice"])
Lang = Literal["ar", "en", "tl"]
PUBLIC = "public, max-age=300"


# --- Short Sharia lines (approved per language before display) ------------


@lru_cache
def _lines() -> list[dict]:
    path = get_settings().content_dir / "practice" / "lines.json"
    return json.loads(path.read_text(encoding="utf-8"))["lines"] if path.exists() else []


def _line_items():
    for i, line in enumerate(_lines()):
        views = {lg: {"title": line["id"], "text": t} for lg, t in line["text"].items() if t}
        yield ReviewItem("practice_line", line["id"], order=(i,), group="practice", views=views)


review.register("practice_line", _line_items)


@router.get("/lines")
async def lines(session: Session, response: Response, lang: Lang = "ar") -> dict:
    live = await review.published(session, "practice_line", lang)
    response.headers["Cache-Control"] = PUBLIC
    return {"lang": lang, "lines": {k: v["text"] for k, v in live.items()}}


# --- PRC-07 adhkar -----------------------------------------------------------


@router.get("/adhkar")
async def adhkar_index(session: Session, response: Response, lang: Lang = "ar") -> dict:
    lib = adhkar.library()
    live = await review.published(session, adhkar.ITEM_TYPE, lang)
    offered = {i.item_id for i in review.items(adhkar.ITEM_TYPE) if lang in i.views}
    groups = []
    for g in lib.groups:
        chapters = []
        for cid in g["chapters"]:
            ch = lib.chapters.get(cid)
            if ch is None:
                continue
            ids = [iid for iid, _ in adhkar.chapter_items(cid) if iid in offered]
            approved = [iid for iid in ids if iid in live]
            title = live[approved[0]]["title"] if approved else ch.title.get(lang) or ch.title["ar"]
            chapters.append({"id": cid, "title": title, "approved_count": len(approved), "total": len(ids)})
        groups.append({"key": g["key"], "chapters": chapters})
    response.headers["Cache-Control"] = PUBLIC
    return {"lang": lang, "groups": groups, "source": {"name": lib.source["name"].get(lang), "url": lib.source["url"]}}


@router.get("/adhkar/audio/{dhikr_id}.mp3")
async def adhkar_audio(dhikr_id: int) -> FileResponse:
    # R5: served by Rafeeq so the request never reaches a third party.
    path = adhkar.audio_path(dhikr_id)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audio_not_available")
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=604800"})


@router.get("/adhkar/{chapter_id}")
async def adhkar_chapter(chapter_id: int, session: Session, response: Response, lang: Lang = "ar") -> dict:
    lib = adhkar.library()
    ch = lib.chapters.get(chapter_id)
    if ch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "chapter_not_found")
    live = await review.published(session, adhkar.ITEM_TYPE, lang)
    items = [{"id": iid, **live[iid]} for iid, _ in adhkar.chapter_items(chapter_id) if iid in live]
    response.headers["Cache-Control"] = PUBLIC
    return {
        "lang": lang,
        "id": chapter_id,
        "group": ch.group,
        "title": items[0]["title"] if items else ch.title.get(lang) or ch.title["ar"],
        "items": items,
        "source": {"name": lib.source["name"].get(lang), "url": lib.source["url"]},
    }


# --- PRC-04 sighting announcements ------------------------------------------


@router.get("/sightings")
async def sightings_list(session: Session, response: Response) -> dict:
    response.headers["Cache-Control"] = PUBLIC
    return {"items": await sightings.published(session)}


class SightingIn(BaseModel):
    country: Literal["SA"] = "SA"
    hijri_year: int = Field(ge=1440, le=1600)
    hijri_month: int = Field(ge=1, le=12)
    start: date
    expected: date = Field(description="Umm al-Qura date of day 1 of that month")
    source_url: HttpUrl


@router.post("/sightings", status_code=status.HTTP_201_CREATED)
async def sightings_publish(body: SightingIn, session: Session, _: Annotated[User, Depends(require_role("team"))]) -> dict:
    # Interim entry point until the SPA reader is built (PRC-04 open question);
    # it applies the same ±1 day rule as the reader will.
    row = await sightings.publish(
        session,
        country=body.country,
        hijri_year=body.hijri_year,
        hijri_month=body.hijri_month,
        start=body.start,
        expected=body.expected,
        source_url=str(body.source_url),
    )
    return {"start": row.start_date.isoformat()}
