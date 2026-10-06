"""KNW-02 §3.8 hybrid retrieval for the answer path, with KNW-01 reliability
R3 diagnostics and the KNW-02 source-coverage policy.

- Language: passages in the asker's language only (KNW-02 R4, plan §3.8).
- Sources: `source_policy.eligible_sources` (SC1): configured, present in
  the database and in `index` mode; `sources=[]` searches nothing.
- Vector: bge-m3 cosine over `knw_passages.embedding` (pgvector HNSW), only
  for sources with vectors made by the current embedding model (S19). A
  source with no vectors yet is searched by its words (S07, embedding_pending).
- Words: Postgres full text over the generated `tsv` column.
- Both channels always run before any "no evidence" decision (R3). The
  cosine threshold `KNW_MIN_SIMILARITY` (> 0) drops weak vector hits only;
  full-text candidates are still passed on, and the composer and verifier
  decide whether they are evidence (a word match is never proof).
- Fusion: reciprocal rank (k=60), then a stable tie-break by passage id.
  Owner decision 2026-10-06: a candidate of `KNW_PREFERRED_SOURCE` moves
  ahead of other sources' candidates whose fused score is higher by at most
  `KNW_NEAR_TIE_EPSILON`; never past a clearly better one, never added.
- One record per ayah: two translations (or tafsir + Arabic) of the same
  ayah collapse to the best-ranked one. Other sources keep every passage
  (each passage id stays available to the verifier; the app groups cards).
- A database error is a technical failure (status `unavailable` or
  `degraded`), never an empty result that looks like "no source" (§14.1).
- The question embedding is cached under exactly the text that was
  embedded, the normalization version, the language and the model (R2.5).
"""

import hashlib
import logging
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import bindparam, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.knowledge import query_normalization, source_policy
from app.knowledge.ai import client
from app.knowledge.ai.client import AiUnavailable
from app.knowledge.ai.textcheck import words
from app.knowledge.models import Passage, Source

log = logging.getLogger("rafeeq.search")
CANDIDATES = 24
RRF_K = 60
# Owner's near-tie preference (2026-10-06): fused (RRF) scores reflect ranks
# only, so a near tie also needs comparable evidence: the two candidates
# share a channel, the better one has no channel the other lacks, and in
# each shared channel the scores are close (cosine within NEAR_TIE_COSINE,
# full-text rank within NEAR_TIE_TEXT_REL of the better one).
NEAR_TIE_COSINE = 0.02
NEAR_TIE_TEXT_REL = 0.10
EMBED_MAX_CHARS = 2000
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
    """The configured answer sources (parsed by the one policy, SC1)."""
    return source_policy.configured_sources()


@dataclass
class RetrievalResult:
    """Structured result for the answer path (PRD §14.1). Counts and codes only."""

    passages: list[dict[str, Any]]
    status: str = "complete"  # complete | degraded | unavailable
    reason: str | None = None  # known code, e.g. embedding_unavailable, retrieval_db_error
    vector_count: int = 0
    text_count: int = 0
    max_similarity: float | None = None
    channel: str = "none"  # hybrid | vector_only | text_only | none
    embedding: str = "skipped"  # computed | cache_hit | unavailable | skipped
    embedding_error: str | None = None
    sources: dict[str, dict[str, Any]] = field(default_factory=dict)  # per-source stage counters (SC6)
    candidates: list[dict[str, Any]] = field(default_factory=list)  # ranked candidates (diagnostics only, no text)

    def trace(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "reason": self.reason,
            "channel": self.channel,
            "embedding": self.embedding,
            "embedding_error": self.embedding_error,
            "vector": self.vector_count,
            "text": self.text_count,
            "passages": len(self.passages),
            "max_similarity": round(self.max_similarity, 4) if self.max_similarity is not None else None,
        }


def _cache_key(embedded: str, lang: str, version: str) -> str:
    model = get_settings().ai_embedding_model
    return hashlib.sha256("\x00".join((model, version, lang, embedded)).encode()).hexdigest()


async def embed_query(query: str, lang: str = "", version: str = "off") -> tuple[list[float] | None, str, str | None]:
    """Embedding of exactly `query[:2000]`, cached in memory under that text,
    the language, the normalization version and the model (no identity, the
    key is a hash). Returns (vector or None, computed|cache_hit|unavailable, error code)."""
    embedded = query[:EMBED_MAX_CHARS]
    key = _cache_key(embedded, lang, version)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key], "cache_hit", None
    try:
        vec = (await client.embed([embedded], agent="search"))[0]
    except AiUnavailable as e:
        return None, "unavailable", str(e)[:40] or type(e).__name__
    _cache[key] = vec
    if len(_cache) > 512:
        _cache.popitem(last=False)
    return vec, "computed", None


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
        .order_by(dist, Passage.id)
        .limit(CANDIDATES)
    )
    return [(r.id, float(r.sim)) for r in rows]


async def _text_hits(session: AsyncSession, question: str, lang: str, sources: list[str]) -> list[tuple[str, float]]:
    """Full-text candidates with their rank score. A database error
    propagates: it is a technical failure, not an empty result (PRD §14.1 rule 2)."""
    q = tsquery(question, lang)
    if not q:
        return []
    cfg = "english" if lang == "en" else "simple"
    stmt = text(
        f"""SELECT id, ts_rank_cd(tsv, q) AS rank FROM knw_passages, to_tsquery('{cfg}', :q) AS q
            WHERE lang = :lang AND source_id IN :sources AND tsv @@ q
            ORDER BY rank DESC, id LIMIT {CANDIDATES}"""
    ).bindparams(bindparam("sources", expanding=True))
    rows = await session.execute(stmt, {"q": q, "lang": lang, "sources": sources})
    return [(r.id, float(r.rank)) for r in rows]


def _dedupe_key(p: Passage) -> str:
    if p.source_id == "quranenc":
        return f"quranenc:{p.ref_key}"
    return p.id


def prefer_on_near_tie(
    ordered: list[str],
    score: dict[str, float],
    source_of: dict[str, str],
    preferred: str,
    eps: float,
    close: Callable[[str, str], bool] | None = None,
) -> list[str]:
    """Owner decision 2026-10-06 (KNW-02): a candidate of the preferred source
    moves ahead of other sources' candidates whose fused score exceeds its own
    by at most `eps` (and, with `close`, whose underlying scores are close).
    It never passes a clearly better candidate, never passes another
    preferred candidate, and adds nothing. Deterministic."""
    if eps <= 0 or not preferred:
        return ordered
    out = list(ordered)
    for i in range(1, len(out)):
        pid = out[i]
        if source_of.get(pid) != preferred:
            continue
        j = i
        while (
            j > 0
            and source_of.get(out[j - 1]) != preferred
            and score[out[j - 1]] - score[pid] <= eps
            and (close is None or close(out[j - 1], pid))
        ):
            j -= 1
        if j != i:
            out.insert(j, out.pop(i))
    return out


async def _rollback(session: AsyncSession) -> None:
    try:
        await session.rollback()
    except SQLAlchemyError:
        log.exception("rollback failed")


async def retrieve(
    session: AsyncSession,
    query: str,
    lang: str,
    k: int | None = None,
    sources: list[str] | None = None,
    *,
    version: str = "off",
    exclude_ids: set[str] | frozenset[str] = frozenset(),
    enforce_config: bool = True,
) -> RetrievalResult:
    """Retrieve up to `k` passages for the search form `query` (never stored)."""
    st = get_settings()
    k = k or st.knw_search_k
    elig = await source_policy.eligible_sources(session, sources, enforce_config=enforce_config)
    per: dict[str, dict[str, Any]] = {sid: {"eligible": False, "exclusion": why} for sid, why in elig.excluded.items()}
    if not elig.sources:
        return RetrievalResult([], reason="no_eligible_sources", sources=per)

    ready = await source_policy.readiness(session, lang)
    rows_src = {s.id: s for s in await session.scalars(select(Source))}
    # plain values now: a rollback below would expire the ORM objects
    names = {sid: s.name for sid, s in rows_src.items()}
    model_ok = {sid: source_policy.vector_model_ok(s) for sid, s in rows_src.items()}
    configured = set(source_policy.configured_sources())
    for sid in rows_src:  # SC6 "configured" stage: in the database, not used for answers
        if sid not in per and sid not in elig.sources and sid not in configured:
            per[sid] = {"eligible": False, "exclusion": source_policy.DISABLED_BY_CONFIG}
    text_sources, vector_sources = [], []
    for sid in elig.sources:
        r = ready.get(sid)
        entry = per.setdefault(sid, {"eligible": True})
        entry.update(vector=0, text=0, below_threshold=0, context=0)
        if r is None or r.passages == 0:
            entry["exclusion"] = source_policy.NO_PASSAGES_FOR_LANG
            continue
        text_sources.append(sid)
        if r.embedded == 0:
            entry["vector_note"] = source_policy.EMBEDDING_PENDING  # S07: searched by its words only
        elif not model_ok.get(sid, False):
            entry["vector_note"] = source_policy.EMBEDDING_MODEL_MISMATCH
        else:
            vector_sources.append(sid)
            if r.embedded < r.passages:
                entry["vector_note"] = f"partial:{r.pct}"
    if not text_sources:
        return RetrievalResult([], reason="no_passages_for_lang", sources=per)

    res = RetrievalResult([], sources=per)
    vhits: list[tuple[str, float]] = []
    vector_failed = text_failed = False
    if vector_sources:
        vec, res.embedding, res.embedding_error = await embed_query(query, lang, version)
        if vec is None:
            vector_failed = True
        else:
            try:
                vhits = await _vector_hits(session, vec, lang, vector_sources)
            except SQLAlchemyError:
                log.exception("vector query failed")
                await _rollback(session)
                vector_failed = True
                res.embedding_error = "retrieval_db_error"
    res.max_similarity = max((s for _, s in vhits), default=None)
    if st.knw_min_similarity > 0:
        weak = [i for i, s in vhits if s < st.knw_min_similarity]
        vhits = [(i, s) for i, s in vhits if s >= st.knw_min_similarity]
    else:
        weak = []
    try:
        tscored = await _text_hits(session, query, lang, text_sources)
    except SQLAlchemyError:
        log.exception("full-text query failed")
        await _rollback(session)
        tscored, text_failed = [], True
    thits = [pid for pid, _ in tscored]
    tscore = dict(tscored)

    if text_failed and (vector_failed or not vector_sources):
        res.status, res.reason = "unavailable", "retrieval_db_error"  # no channel worked
    elif text_failed:
        res.status, res.reason = "degraded", "retrieval_db_error"
    elif vector_failed:
        res.status = "degraded"
        res.reason = "retrieval_db_error" if res.embedding_error == "retrieval_db_error" else "embedding_unavailable"
    res.vector_count, res.text_count = len(vhits), len(thits)
    res.channel = "hybrid" if vhits and thits else "vector_only" if vhits else "text_only" if thits else "none"

    score: dict[str, float] = {}
    for rank, (pid, _) in enumerate(vhits):
        score[pid] = score.get(pid, 0) + 1 / (RRF_K + rank)
    for rank, pid in enumerate(thits):
        score[pid] = score.get(pid, 0) + 1 / (RRF_K + rank)
    sims = dict(vhits)
    ids_needed = set(score) | set(weak)
    rows = {p.id: p for p in await session.scalars(select(Passage).where(Passage.id.in_(ids_needed)))} if ids_needed else {}
    for pid in weak:
        if pid in rows and rows[pid].source_id in per:
            per[rows[pid].source_id]["below_threshold"] += 1
    for pid in score:
        if pid in rows:
            e = per[rows[pid].source_id]
            e["vector"] += pid in sims
            e["text"] += pid in thits
    ordered = sorted(score, key=lambda i: (-score[i], i))  # stable tie-break by id (R3)
    source_of = {pid: rows[pid].source_id for pid in ordered if pid in rows}

    def close(better: str, cand: str) -> bool:
        """Comparable and close: at least one shared channel, no channel where
        only the better one was found, and close scores in every shared one."""
        if (better in sims and cand not in sims) or (better in tscore and cand not in tscore):
            return False  # the better candidate has evidence the other lacks
        shared = False
        if better in sims and cand in sims:
            shared = True
            if sims[better] - sims[cand] > NEAR_TIE_COSINE:
                return False
        if better in tscore and cand in tscore:
            shared = True
            if tscore[cand] < tscore[better] * (1 - NEAR_TIE_TEXT_REL):
                return False
        return shared

    ordered = prefer_on_near_tie(ordered, score, source_of, st.knw_preferred_source, st.knw_near_tie_epsilon, close)

    seen: set[str] = set()
    for rank, pid in enumerate(ordered):
        p = rows.get(pid)
        if p is None:
            continue
        cand = {
            "passage_id": pid,
            "source_id": p.source_id,
            "ref_key": p.ref_key,
            "rank": rank + 1,
            "channel": "both" if pid in sims and pid in thits else "vector" if pid in sims else "text",
            "similarity": round(sims[pid], 4) if pid in sims else None,
            "rrf": round(score[pid], 6),
            "selected_for_context": False,
        }
        res.candidates.append(cand)
        if pid in exclude_ids or _dedupe_key(p) in seen or len(res.passages) >= k:
            continue
        seen.add(_dedupe_key(p))
        cand["selected_for_context"] = True
        per[p.source_id]["context"] += 1
        res.passages.append(passage_dict(p, names.get(p.source_id, p.source_id), sims.get(pid)))
    for sid in elig.sources:
        e = per[sid]
        if "exclusion" in e:
            continue
        if e["vector"] + e["text"] == 0:
            e["exclusion"] = "below_threshold" if e["below_threshold"] else "no_relevant_hits"
        elif e["context"] == 0:
            e["exclusion"] = "context_limit"
    return res


async def search(
    session: AsyncSession, question: str, lang: str, k: int | None = None, sources: list[str] | None = None
) -> list[dict[str, Any]]:
    """The passages only, for the KNW-04 tools; the answer path uses `retrieve`."""
    q = query_normalization.build(question, lang)
    return (await retrieve(session, q.canonical, lang, k, sources, version=q.version)).passages


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
