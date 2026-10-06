"""KNW-02 R3: Quran and hadith text is shown from the stored record by its
id, never generated or rewritten. Lessons cite verses by reference only
(`{sura, ayat}`); the app fetches the words here. A saved answer (KNW-09 R2)
keeps only its passage ids and gets their records from `/passages`.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from app.core.deps import Session
from app.knowledge import source_policy
from app.knowledge.ask import source_cards
from app.knowledge.models import Passage, Source

router = APIRouter(prefix="/api/scripture", tags=["scripture"])

# Translation shown with the Arabic for each learner language (QuranEnc keys).
TRANSLATION = {"en": "english_saheeh", "tl": "tagalog_rwwad"}
TRANSLATION_NAME = {
    "english_saheeh": "Saheeh International (QuranEnc)",
    "tagalog_rwwad": "Rowwad Translation Center (QuranEnc)",
}


@router.get("/quran")
async def quran(
    session: Session,
    response: Response,
    sura: int = Query(ge=1, le=114),
    start: int = Query(ge=1, le=286, alias="from"),
    end: int | None = Query(default=None, ge=1, le=286, alias="to"),
    lang: Literal["ar", "en", "tl"] = "ar",
) -> dict:
    end = end or start
    if end < start or end - start > 40:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "bad_range")
    keys = [f"{sura}:{a}" for a in range(start, end + 1)]
    rows = list(await session.scalars(select(Passage).where(Passage.source_id == "quranenc", Passage.ref_key.in_(keys))))
    arabic = {p.ref_key: p for p in rows if p.kind == "quran_arabic"}
    if len(arabic) != len(keys):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_loaded")
    tkey = TRANSLATION.get(lang)
    trans = {p.ref_key: p for p in rows if p.kind == "quran_translation" and p.meta.get("translation_key") == tkey}
    src = await session.get(Source, "quranenc")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return {
        "sura": sura,
        "ayat": [
            {
                "aya": int(k.split(":")[1]),
                "arabic": arabic[k].quote_text,
                "translation": trans[k].quote_text if k in trans else None,
                "url": arabic[k].origin_url,
            }
            for k in keys
        ],
        "source": {
            "name": "QuranEnc.com",
            "translation": TRANSLATION_NAME.get(tkey or "") if trans else None,
            "version": next(iter(trans.values())).version if trans else arabic[keys[0]].version,
            "loaded": (src.versions or {}).get("loaded_at") if src else None,
        },
    }


@router.get("/passages")
async def passages(session: Session, response: Response, ids: Annotated[list[str], Query(min_length=1, max_length=40)]) -> dict:
    """KNW-09 R2/R6: the stored records behind a saved answer, by passage id,
    as the same source cards /api/ask returns. Only sources the answer path
    may use today; a missing id is left out (the app then does not show the
    answer). Nothing about the learner goes in."""
    wanted = list(dict.fromkeys(ids))
    if any(not i or len(i) > 96 for i in wanted):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "bad_id")
    allowed = set((await source_policy.eligible_sources(session)).sources)
    response.headers["Cache-Control"] = "public, max-age=300"
    return {"cards": await source_cards(session, wanted, allowed)}
