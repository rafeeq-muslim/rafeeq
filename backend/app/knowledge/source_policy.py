"""KNW-02 SC1: the one answer-source policy, used by search, the embedding
job and the diagnostics (docs/domains/knowledge/features/KNW-02-source-coverage-and-retrieval-prd.md).

Concepts kept apart:
- configured_for_answers: listed in `KNW_ANSWER_SOURCES` (product setting);
- index_mode: the source row allows its content in the index (`mode = index`);
  `link` sources, or a source missing from the database, are never used;
- available_languages / data_ready: passages, vectors and text index per
  language, read from the data (never assumed);
- effective_for_request: eligible for this question, or the reason it is not.

Filter semantics: `requested=None` means the policy's sources; `requested=[]`
means no source (an empty result, never "all"); an explicit list is
intersected with the configured list on the answer path.
"""

import logging
import time
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.knowledge.load import SOURCES as LOADER_SOURCES
from app.knowledge.models import Passage, Source

log = logging.getLogger("rafeeq.sources")

# Every source the loader knows (load.SOURCES mirrors docs/agents/sources.md).
# A name outside this set is a configuration error.
KNOWN_SOURCES = tuple(LOADER_SOURCES)

# Exclusion reasons (KNW-02 SC6).
DISABLED_BY_CONFIG = "disabled_by_answer_config"
MODE_LINK = "mode_link"
MISSING_SOURCE = "missing_source"
UNKNOWN_SOURCE = "unknown_source"
NO_PASSAGES_FOR_LANG = "no_passages_for_lang"
EMBEDDING_PENDING = "embedding_pending"
EMBEDDING_MODEL_MISMATCH = "embedding_model_mismatch"

READINESS_TTL = 600.0  # seconds; per-language passage/vector counts change only with loads and the embed job


class SourcePolicyError(ValueError):
    """An unknown source name in a list that must be exact."""


def parse_sources(raw: str | None, *, strict: bool = False) -> tuple[list[str], list[str]]:
    """Names after trim, without blanks or repeats, in their first order.
    Returns (known, unknown). With strict=True an unknown name raises."""
    names = list(dict.fromkeys(s.strip() for s in (raw or "").split(",") if s.strip()))
    unknown = [n for n in names if n not in KNOWN_SOURCES]
    if unknown and strict:
        raise SourcePolicyError(f"unknown answer source(s): {', '.join(unknown)}")
    return [n for n in names if n in KNOWN_SOURCES], unknown


_warned: set[str] = set()


def configured_sources() -> list[str]:
    """`KNW_ANSWER_SOURCES`, parsed once per value. An unknown name is logged
    loudly and left out (it never widens the search); diagnostics report it."""
    known, unknown = parse_sources(get_settings().knw_answer_sources)
    for n in unknown:
        if n not in _warned:
            _warned.add(n)
            log.error("KNW_ANSWER_SOURCES has an unknown source %r; it is ignored", n)
    return known


def unknown_configured() -> list[str]:
    return parse_sources(get_settings().knw_answer_sources)[1]


@dataclass
class Eligibility:
    sources: list[str]  # eligible, in configured order
    excluded: dict[str, str] = field(default_factory=dict)  # source id -> reason


async def eligible_sources(session: AsyncSession, requested: list[str] | None = None, *, enforce_config: bool = True) -> Eligibility:
    """Sources the answer path may use. `enforce_config=False` is for the
    internal diagnostics on a test index only (never reachable from HTTP)."""
    configured = configured_sources()
    excluded: dict[str, str] = {n: UNKNOWN_SOURCE for n in unknown_configured()}
    if requested is None:
        wanted = configured
    else:
        wanted = list(dict.fromkeys(requested))
        for n in wanted:
            if n not in KNOWN_SOURCES:
                excluded[n] = UNKNOWN_SOURCE
            elif enforce_config and n not in configured:
                excluded[n] = DISABLED_BY_CONFIG
        wanted = [n for n in wanted if n not in excluded]
    if not wanted:
        return Eligibility([], excluded)
    rows = {s.id: s for s in await session.scalars(select(Source).where(Source.id.in_(wanted)))}
    out = []
    for n in wanted:
        src = rows.get(n)
        if src is None:
            excluded[n] = MISSING_SOURCE
        elif src.mode != "index":
            excluded[n] = MODE_LINK
        else:
            out.append(n)
    return Eligibility(out, excluded)


# --- readiness (data_ready) -----------------------------------------------------


@dataclass
class Readiness:
    passages: int
    embedded: int

    @property
    def pct(self) -> float:
        return round(100.0 * self.embedded / self.passages, 2) if self.passages else 0.0


_ready: dict[str, tuple[float, dict[str, Readiness]]] = {}


def reset_readiness_cache() -> None:
    _ready.clear()


async def readiness(session: AsyncSession, lang: str) -> dict[str, Readiness]:
    """Passages and vectors per source in `lang`, cached for READINESS_TTL."""
    hit = _ready.get(lang)
    if hit and time.monotonic() - hit[0] < READINESS_TTL:
        return hit[1]
    rows = await session.execute(
        select(Passage.source_id, func.count(), func.count(Passage.embedding)).where(Passage.lang == lang).group_by(Passage.source_id)
    )
    data = {sid: Readiness(int(n), int(e)) for sid, n, e in rows}
    _ready[lang] = (time.monotonic(), data)
    return data


def vector_model_ok(src: Source | None) -> bool:
    """KNW-02 S19: vectors recorded under another embedding model are not
    searched (they live in another space). No record means the vectors were
    made before recording started, with the current default model."""
    model = ((src.versions or {}).get("embedding") or {}).get("model") if src else None
    return model is None or model == get_settings().ai_embedding_model
