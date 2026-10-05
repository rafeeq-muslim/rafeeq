"""KNW-02 §3.8 `search(question, lang, k)`: hybrid retrieval for the answer path.

- Language: passages in the asker's language only (KNW-02 R4, plan §3.8).
- Sources: only those in `KNW_ANSWER_SOURCES`, all of them `index` mode.
- Vector: bge-m3 cosine over `knw_passages.embedding` (pgvector HNSW).
- Words: Postgres full text over the generated `tsv` column (plan §2.2 found
  words alone too weak; they still catch names and exact terms).
- Fusion: reciprocal rank (k=60). The cosine score is kept for the
  threshold: when `KNW_MIN_SIMILARITY` > 0 and no vector hit reaches it,
  the result is empty ("no source, no answer"). If the question cannot be
  embedded (outage or budget), the full-text hits are used alone.
- One record per ayah: two translations (or tafsir + Arabic) of the same
  ayah collapse to the best-ranked one.
"""

import hashlib
import logging
from collections import OrderedDict
from typing import Any

from sqlalchemy import bindparam, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.knowledge.ai import client
from app.knowledge.ai.client import AiUnavailable
from app.knowledge.ai.textcheck import normalize, words
from app.knowledge.models import Passage, Source

log = logging.getLogger("rafeeq.search")
CANDIDATES = 24
RRF_K = 60
_STOP = {
    "ar": set(
        "في من على عن الى إلى ما ماذا هل كيف لماذا متى اين أين هو هي ان أن إن ثم او أو و يا هذا هذه ذلك تلك التي الذي الذين كان كانت لا لم لن قد مع عند كل بعض انا انت نحن هم هن له لها لي لك به بها فيه فيها".split()
    ),
    "tl": set(
        "ang ng sa mga na ay ito iyon siya sila kami tayo ako ko mo ka ba po ano paano bakit kailan saan sino at o kung para hindi may mayroon wala din rin lang naman nang ni kay".split()
    ),
}
_PREFIXES = ("وال", "بال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ل")
_cache: OrderedDict[str, list[float]] = OrderedDict()


def answer_sources() -> list[str]:
    return [s.strip() for s in get_settings().knw_answer_sources.split(",") if s.strip()]


async def embed_query(question: str) -> list[float] | None:
    """Embedding of the question, cached in memory by hash (no identity, no text kept)."""
    key = hashlib.sha256(normalize(question).encode()).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    try:
        vec = (await client.embed([question[:2000]], agent="search"))[0]
    except AiUnavailable:
        return None
    _cache[key] = vec
    if len(_cache) > 512:
        _cache.popitem(last=False)
    return vec


def tsquery(question: str, lang: str) -> str | None:
    """OR of the question's content words, each as a prefix; Arabic words also
    without their leading particles (و، ب، ال...)."""
    terms: list[str] = []
    for w in words(question):
        w = w.replace("'", "")
        if len(w) < 2 or w in _STOP.get(lang, ()) or w.isdigit():
            continue
        alts = {w}
        if lang == "ar":
            for p in _PREFIXES:
                if w.startswith(p) and len(w) - len(p) >= 3:
                    alts.add(w[len(p) :])
                    break
        terms.extend(f"{a}:*" for a in sorted(alts))
    return " | ".join(dict.fromkeys(terms)) or None


async def _vector_hits(session: AsyncSession, vec: list[float], lang: str, sources: list[str]) -> list[tuple[str, float]]:
    await session.execute(text("SET LOCAL hnsw.ef_search = 200"))
    await session.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
    dist = Passage.embedding.cosine_distance(vec)
    rows = await session.execute(
        select(Passage.id, (1 - dist).label("sim"))
        .where(Passage.lang == lang, Passage.source_id.in_(sources), Passage.embedding.is_not(None))
        .order_by(dist)
        .limit(CANDIDATES)
    )
    return [(r.id, float(r.sim)) for r in rows]


async def _text_hits(session: AsyncSession, question: str, lang: str, sources: list[str]) -> list[str]:
    q = tsquery(question, lang)
    if not q:
        return []
    cfg = "english" if lang == "en" else "simple"
    stmt = text(
        f"""SELECT id FROM knw_passages, to_tsquery('{cfg}', :q) AS q
            WHERE lang = :lang AND source_id IN :sources AND tsv @@ q
            ORDER BY ts_rank_cd(tsv, q) DESC LIMIT {CANDIDATES}"""
    ).bindparams(bindparam("sources", expanding=True))
    try:
        rows = await session.execute(stmt, {"q": q, "lang": lang, "sources": sources})
    except Exception:  # a malformed query must not break the answer path
        log.exception("full-text query failed")
        await session.rollback()
        return []
    return [r.id for r in rows]


def _dedupe_key(p: Passage) -> str:
    if p.source_id == "quranenc":
        return f"quranenc:{p.ref_key}"
    return p.id


async def search(
    session: AsyncSession, question: str, lang: str, k: int | None = None, sources: list[str] | None = None
) -> list[dict[str, Any]]:
    st = get_settings()
    k = k or st.knw_search_k
    sources = sources or answer_sources()
    vec = await embed_query(question)
    vhits = await _vector_hits(session, vec, lang, sources) if vec is not None else []
    if st.knw_min_similarity > 0 and vec is not None:
        vhits = [(i, s) for i, s in vhits if s >= st.knw_min_similarity]
        if not vhits:
            return []
    thits = await _text_hits(session, question, lang, sources)

    score: dict[str, float] = {}
    for rank, (pid, _) in enumerate(vhits):
        score[pid] = score.get(pid, 0) + 1 / (RRF_K + rank)
    for rank, pid in enumerate(thits):
        score[pid] = score.get(pid, 0) + 1 / (RRF_K + rank)
    if not score:
        return []
    sims = dict(vhits)
    ordered = sorted(score, key=lambda i: -score[i])
    rows = {p.id: p for p in await session.scalars(select(Passage).where(Passage.id.in_(ordered)))}
    names = {s.id: s.name for s in await session.scalars(select(Source))}
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for pid in ordered:
        p = rows.get(pid)
        if p is None or _dedupe_key(p) in seen:
            continue
        seen.add(_dedupe_key(p))
        out.append(passage_dict(p, names.get(p.source_id, p.source_id), sims.get(pid)))
        if len(out) >= k:
            break
    return out


def passage_dict(p: Passage, source_name: str, score: float | None = None) -> dict[str, Any]:
    return {
        "id": p.id,
        "source_id": p.source_id,
        "source_name": source_name,
        "kind": p.kind,
        "lang": p.lang,
        "ref": p.ref,
        "ref_key": p.ref_key,
        "quote_text": p.quote_text,
        "context_text": p.context_text,
        "meta": p.meta or {},
        "version": p.version,
        "origin_url": p.origin_url,
        "score": score,
    }
