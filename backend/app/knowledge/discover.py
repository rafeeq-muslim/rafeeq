"""Discover API (KNW-03, KNW-06, KNW-07, KNW-08, KNW-09).

Learner endpoints serve the merged text (reviewed before merge, rules.md §1.4 since 2026-10-06; a version the reviewer returns is withdrawn) (KNW-05) and are the same
for every user: nothing about the learner goes in or is logged (KNW-06 R6,
KNW-07 R5, KNW-08 R5). Saved items have an optional account copy (KNW-09 R3).
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Response
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import delete, select

from app.core.deps import CurrentUser, Session
from app.knowledge import daily, glossary, library, recitation
from app.knowledge.models import SavedItem
from app.knowledge.review import published

router = APIRouter(prefix="/api", tags=["discover"])
Lang = Literal["ar", "en", "tl"]
PUBLIC = "public, max-age=300"


@router.get("/discover/cards")
async def cards(session: Session, response: Response, lang: Lang = "ar") -> dict:
    """KNW-07: the ordered approved cards; the device picks today's (R4)."""
    live = await published(session, daily.ITEM_TYPE, lang)
    response.headers["Cache-Control"] = PUBLIC
    data = daily.load()
    return {"lang": lang, "total": len(data["cards"]), "cards": daily.approved_cards(live), "previous": data.get("previous")}


@router.get("/discover/library")
async def library_list(session: Session, response: Response, lang: Lang = "ar") -> dict:
    """KNW-06 R1/R2: approved items of one language by topic, dead links hidden."""
    live = await published(session, library.ITEM_TYPE, lang)
    hidden = await library.hidden_ids(session)
    response.headers["Cache-Control"] = PUBLIC
    return {"lang": lang, "topics": library.learner_topics(live, hidden)}


@router.get("/discover/recitations")
async def recitations(session: Session, response: Response, lang: Lang = "ar") -> dict:
    """KNW-08 R4: the approved recited mushaf, or none."""
    live = await published(session, recitation.ITEM_TYPE, lang)
    rec = next((live[r["id"]] for r in recitation.load() if r["id"] in live), None)
    response.headers["Cache-Control"] = PUBLIC
    return {"lang": lang, "recitation": rec}


@router.get("/glossary")
async def glossary_terms(session: Session, response: Response, lang: Lang = "ar") -> dict:
    """KNW-03 R2: approved terms only (service for lessons and the assistant)."""
    response.headers["Cache-Control"] = PUBLIC
    return {"lang": lang, "terms": await glossary.approved_terms(session, lang)}


# --- KNW-09 account copy of saved items -----------------------------------------

Kind = Literal["card", "library", "answer"]


class Saved(BaseModel):
    kind: Kind
    ref: Annotated[str, Field(min_length=1, max_length=96)]
    saved_at: AwareDatetime


class SavedList(BaseModel):
    items: list[Saved] = Field(default_factory=list, max_length=2000)


async def _saved_of(session, user_id) -> list[Saved]:
    rows = await session.scalars(select(SavedItem).where(SavedItem.user_id == user_id).order_by(SavedItem.saved_at.desc()))
    return [Saved(kind=r.kind, ref=r.ref_id, saved_at=r.saved_at) for r in rows]


@router.get("/me/saved")
async def get_saved(session: Session, user: CurrentUser) -> SavedList:
    return SavedList(items=await _saved_of(session, user.id))


@router.put("/me/saved")
async def merge_saved(body: SavedList, session: Session, user: CurrentUser) -> SavedList:
    """R3: union of the device and the account, one copy each, earliest date kept."""
    rows = {(r.kind, r.ref_id): r for r in await session.scalars(select(SavedItem).where(SavedItem.user_id == user.id))}
    for it in body.items:
        row = rows.get((it.kind, it.ref))
        if row is None:
            row = SavedItem(user_id=user.id, kind=it.kind, ref_id=it.ref, payload={}, saved_at=it.saved_at)
            session.add(row)
            rows[(it.kind, it.ref)] = row
        elif it.saved_at < row.saved_at:
            row.saved_at = it.saved_at
    await session.commit()
    return SavedList(items=await _saved_of(session, user.id))


@router.delete("/me/saved", status_code=204)
async def delete_all_saved(session: Session, user: CurrentUser) -> None:
    await session.execute(delete(SavedItem).where(SavedItem.user_id == user.id))
    await session.commit()


@router.delete("/me/saved/{kind}/{ref}", status_code=204)
async def delete_saved(kind: Kind, ref: str, session: Session, user: CurrentUser) -> None:
    await session.execute(delete(SavedItem).where(SavedItem.user_id == user.id, SavedItem.kind == kind, SavedItem.ref_id == ref))
    await session.commit()
