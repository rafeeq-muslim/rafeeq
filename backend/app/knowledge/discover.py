"""Discover API (KNW-03, KNW-06, KNW-07, KNW-08, KNW-09).

Learner endpoints serve the merged text (reviewed before merge, rules.md §1.4 since 2026-10-06; a version the reviewer returns is withdrawn) (KNW-05) and are the same
for every user: nothing about the learner goes in or is logged (KNW-06 R6,
KNW-07 R5, KNW-08 R5). Saved items have an optional account copy (KNW-09 R3).
"""

from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationError, model_serializer, model_validator
from sqlalchemy import delete, select

from app.core import ratelimit
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
    """KNW-06 R1/R2: approved items of one language by path unit, then «عام», dead links hidden."""
    live = await published(session, library.ITEM_TYPE, lang)
    hidden = await library.hidden_ids(session)
    response.headers["Cache-Control"] = PUBLIC
    return {"lang": lang, "topics": library.learner_topics(live, hidden, lang)}


@router.get("/discover/recitations")
async def recitations(session: Session, response: Response, lang: Lang = "ar") -> dict:
    """KNW-08 R4: the recited mushaf (al-Muaiqly, per surah), or none, and the
    Quranpedia per-verse reciters the Sharia reviewer has approved (R2: played
    verse by verse); the app offers those reciters instead once there is one."""
    live = await published(session, recitation.ITEM_TYPE, lang)
    rec = next((live[r["id"]] for r in recitation.load() if r["id"] in live), None)
    # PLT-11 R5 / PLT-12: each surah file's size, shown before it plays or downloads.
    # Added here, not to the reviewed view, so the approved version is unchanged.
    if rec is not None:
        rec = {**rec, "sizes": recitation.sizes(rec["id"])}
    reciters = await recitation.approved_reciters(session, lang)
    response.headers["Cache-Control"] = PUBLIC
    return {"lang": lang, "recitation": rec, "reciters": reciters}


@router.get("/glossary")
async def glossary_terms(session: Session, response: Response, lang: Lang = "ar") -> dict:
    """KNW-03 R2: approved terms only (service for lessons and the assistant)."""
    response.headers["Cache-Control"] = PUBLIC
    return {"lang": lang, "terms": await glossary.approved_terms(session, lang)}


# --- KNW-09 account copy of saved items -----------------------------------------

Kind = Literal["card", "library", "answer"]


class SavedLiveSource(BaseModel):
    """PRD live v3 step 6 (knw-live-source-access): a saved answer whose
    source was read live keeps that source's identity, its link and when it
    was read, never its text. The link must be a live connector's own page."""

    model_config = ConfigDict(extra="forbid")
    id: Annotated[str, Field(pattern=r"^live:[a-z_]{2,32}:(ar|en|tl):\d{1,9}:c\d{1,3}$")]
    source_id: Annotated[str, Field(pattern=r"^[a-z_]{2,32}$")]
    title: Annotated[str, Field(max_length=300)] = ""
    origin_url: Annotated[str, Field(min_length=10, max_length=600)]
    retrieved_at: Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")]

    @model_validator(mode="after")
    def _connector_page(self) -> "SavedLiveSource":
        from app.knowledge.live_sources import registry

        conn = registry.connectors().get(self.source_id)
        host = urlsplit(self.origin_url)
        if (
            conn is None
            or host.scheme != "https"
            or (host.hostname or "") not in conn.hosts
            or not self.id.startswith(f"live:{self.source_id}:")
        ):
            raise ValueError("live source must link to its connector's own site")
        return self


class SavedAnswer(BaseModel):
    """R2: a saved answer keeps its text, its source ids and its language,
    never the question (the consent rule for the question is still open, so
    it is not stored; an extra field is refused). The Quran and hadith words
    are never kept here: they are shown from the stored records by id."""

    model_config = ConfigDict(extra="forbid")
    lang: Lang
    answer: Annotated[str, Field(min_length=1, max_length=12000)]
    source_ids: Annotated[list[Annotated[str, Field(min_length=1, max_length=96)]], Field(min_length=1, max_length=40)]
    # PRD live v3: identity of each live source among source_ids (optional; left out when empty).
    live_sources: Annotated[list[SavedLiveSource], Field(max_length=40)] = []

    @model_validator(mode="after")
    def _live_among_sources(self) -> "SavedAnswer":
        if any(s.id not in self.source_ids for s in self.live_sources):
            raise ValueError("live source not among source_ids")
        return self

    @model_serializer(mode="wrap")
    def _without_empty_live(self, handler):  # older copies and clients see the same three fields
        d = handler(self)
        if not d.get("live_sources"):
            d.pop("live_sources", None)
        return d


class Saved(BaseModel):
    kind: Kind
    ref: Annotated[str, Field(min_length=1, max_length=96)]
    saved_at: AwareDatetime
    answer: SavedAnswer | None = None

    @model_validator(mode="after")
    def _answer_only_for_answers(self) -> "Saved":
        if self.answer is not None and self.kind != "answer":
            raise ValueError("answer payload only for kind=answer")
        return self


class SavedList(BaseModel):
    items: list[Saved] = Field(default_factory=list, max_length=2000)


def _answer_of(row: SavedItem) -> SavedAnswer | None:
    if row.kind != "answer" or not row.payload:
        return None
    try:
        return SavedAnswer.model_validate(row.payload)
    except ValidationError:
        return None  # an old or damaged copy is never shown


# Security review 2026-10-07 (A-M3): an account keeps at most this many saved
# items. A device may hold more (guests save without an account); what does
# not fit stays on the device only. Writes are limited per account.
SAVED_MAX = 500
SAVED_WRITES_PER_MIN = 30


async def _saved_of(session, user_id) -> list[Saved]:
    rows = await session.scalars(
        select(SavedItem).where(SavedItem.user_id == user_id).order_by(SavedItem.saved_at.desc()).limit(SAVED_MAX)
    )
    return [Saved(kind=r.kind, ref=r.ref_id, saved_at=r.saved_at, answer=_answer_of(r)) for r in rows]


@router.get("/me/saved")
async def get_saved(session: Session, user: CurrentUser) -> SavedList:
    return SavedList(items=await _saved_of(session, user.id))


@router.put("/me/saved")
async def merge_saved(body: SavedList, session: Session, user: CurrentUser) -> SavedList:
    """R3: union of the device and the account, one copy each, earliest date
    kept. A saved answer moves with its text and source ids (R2), never its
    question. Past `SAVED_MAX` items the newest of the device's new items are
    taken first and the rest are not stored."""
    ratelimit.hit(f"saved-sync:{user.id}", SAVED_WRITES_PER_MIN, 60)
    rows = {(r.kind, r.ref_id): r for r in await session.scalars(select(SavedItem).where(SavedItem.user_id == user.id))}
    for it in sorted(body.items, key=lambda i: i.saved_at, reverse=True):
        payload = it.answer.model_dump() if it.answer else {}
        row = rows.get((it.kind, it.ref))
        if row is None:
            if len(rows) >= SAVED_MAX:
                continue
            row = SavedItem(user_id=user.id, kind=it.kind, ref_id=it.ref, payload=payload, saved_at=it.saved_at)
            session.add(row)
            rows[(it.kind, it.ref)] = row
            continue
        if it.saved_at < row.saved_at:
            row.saved_at = it.saved_at
        if payload and not row.payload:
            row.payload = payload
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


# --- KNW-06 library live search (PRD-LIBRARY-LIVE-SEARCH; knw-06-library-live-search-build) ---
# A separate contract next to GET /discover/library, which is unchanged: search
# results are external material, never reviewed catalogue items (B15, B19).

from fastapi import HTTPException, Request  # noqa: E402
from pydantic import StringConstraints  # noqa: E402

from app.core import clientkey  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.db import release  # noqa: E402
from app.core.deps import OptionalUser  # noqa: E402
from app.knowledge import library_search  # noqa: E402

NO_STORE = {"Cache-Control": "no-store"}
LibrarySourceId = Literal["islamic_content", "islamhouse"]  # §6: the library allowlist; anything else is a 422 (B21)
LibraryType = Literal["book", "article", "audio", "video", "fatwa", "poster", "khutbah", "qa"]


class LibrarySearchIn(BaseModel):
    """§6. Omitted `sources` = every library source that can be searched now;
    an empty list is refused, never read as "all"."""

    model_config = ConfigDict(extra="forbid")
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
    lang: Lang
    sources: Annotated[list[LibrarySourceId], Field(min_length=1, max_length=2)] | None = None
    type: LibraryType | None = None
    page_size: Annotated[int, Field(ge=1, le=20)] = 12
    cursor: Annotated[str, Field(min_length=8, max_length=96, pattern=r"^[A-Za-z0-9_.\-]+$")] | None = None


def _no_store_error(status: int, detail) -> HTTPException:
    return HTTPException(status, detail, headers=NO_STORE)


@router.get("/discover/library/search/sources")
async def library_search_sources(response: Response, lang: Lang = "ar") -> dict:
    """Which library sources the screen may offer now (§5): the encyclopedia
    stays unavailable until its search is permitted."""
    response.headers.update(NO_STORE)
    if not get_settings().library_search_enabled:
        return {"enabled": False, "sources": []}
    return {"enabled": True, "sources": library_search.availability(lang)}


@router.post("/discover/library/search")
async def library_search_route(body: LibrarySearchIn, request: Request, response: Response, user: OptionalUser, session: Session) -> dict:
    """§6: POST so the words never sit in a URL; no-store; nothing stored or logged
    about the query or the person (B14). Guests may search (rate-limited)."""
    if not get_settings().library_search_enabled:
        raise _no_store_error(404, "library_search_off")
    try:  # security audit A-L5: per address (IPv6: per /64) and per account
        clientkey.hit("libsearch:m", request, user, 20, 60)
        clientkey.hit("libsearch:d", request, user, 400, 86400)
    except HTTPException as e:
        raise _no_store_error(429, "rate_limited") from e
    requested = list(dict.fromkeys(body.sources)) if body.sources is not None else None
    await release(session)  # A-M1: the session that read the account holds no connection while the sites are searched
    try:
        result = await library_search.search(
            query=body.query, lang=body.lang, requested=requested, lib_type=body.type, page_size=body.page_size, cursor=body.cursor
        )
    except library_search.SearchError as e:
        raise _no_store_error(e.status, {"code": e.code, **e.extra}) from None
    response.headers.update(NO_STORE)
    return result
