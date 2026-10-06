"""KNW-02 R3: Quran and hadith text is shown from the stored record by its
id, never generated or rewritten. Lessons cite verses by reference only
(`{sura, ayat}`); the app fetches the words here. A hadith is fetched by its
HadeethEnc id (`/hadith/{id}`), with its stored grade and source reference.
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Path, Query, Response, status
from sqlalchemy import select

from app.core.deps import Session
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


# --- KNW-02 R3: a hadith by its id ---------------------------------------------


@router.get("/hadith/{hadith_id}")
async def hadith(
    session: Session,
    response: Response,
    hadith_id: int = Path(ge=1, le=10_000_000),
    lang: Literal["ar", "en", "tl"] = "ar",
) -> dict:
    """The stored HadeethEnc record in `lang`, exactly as loaded: its text,
    grade and source reference (attribution and reference). No record in that
    language → 404 `not_loaded`; no other text is offered in its place."""
    p = await session.scalar(
        select(Passage).where(
            Passage.source_id == "hadeethenc", Passage.kind == "hadith", Passage.lang == lang, Passage.ref_key == str(hadith_id)
        )
    )
    src = await session.get(Source, "hadeethenc")
    if p is None or src is None or src.mode != "index":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_loaded")
    meta = p.meta or {}
    response.headers["Cache-Control"] = "public, max-age=86400"
    return {
        "id": hadith_id,
        "lang": lang,
        "text": p.quote_text,
        "arabic": meta.get("hadeeth_ar") or None,
        "grade": meta.get("grade") or None,
        "attribution": meta.get("attribution") or None,
        "reference": meta.get("reference") or None,
        "url": p.origin_url,
        "source": {"name": "HadeethEnc.com", "version": p.version},
    }
