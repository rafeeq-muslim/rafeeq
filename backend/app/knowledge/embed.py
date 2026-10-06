"""KNW-02 §3.6: embed passages with bge-m3 (via OpenRouter).

Selects passages whose `embedding` is NULL (new rows, and rows whose text
changed: the loader clears the vector when `text_hash` changes), so a run
resumes where the last one stopped. Each batch passes the AI spend guard
first (the embedding job's own daily ceiling, AI_EMBED_DAILY_BUDGET_USD,
under the $10 total) and is written in its own transaction.

KNW-02 SC3 / S13 / S19:
- coverage per source and language (passages, embedded, remaining, %), the
  model, the last run, the last success and the stop reason are recorded in
  `knw_sources.versions["embedding"]`; a source is `ready` only when
  nothing remains (a finished batch is not a finished source);
- vectors from different models are never mixed: a source whose recorded
  model differs from `AI_EMBEDDING_MODEL` is skipped until it is re-embedded
  on purpose with `--reembed` (which clears that source's vectors first);
- batches take turns over every (source, language) with work left, so the
  daily ceiling is shared fairly: before this, rows went strictly by id and
  islamqa English (`islamqa:en:…`) waited until all of islamqa Arabic was done.

Usage:
  python -m app.knowledge.embed [--source quranenc] [--kind hadith] [--lang en]
                                [--limit 5000] [--batch 64] [--estimate] [--reembed]
"""

import argparse
import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.knowledge.ai import client
from app.knowledge.ai.client import AiUnavailable, BudgetExceeded
from app.knowledge.models import Passage, Source

log = logging.getLogger("rafeeq.embed")
MAX_CHARS = 6000  # quote + context; keeps a long fatwa at about 2k tokens
CHARS_PER_TOKEN = 3.3  # rough figure for the XLM-R tokenizer of bge-m3 (estimate only)
RETRIES = 5  # per batch, with exponential back-off (2 s … 32 s)


def embed_text(p: Passage) -> str:
    text = p.quote_text if not p.context_text else f"{p.quote_text}\n\n{p.context_text}"
    return text[:MAX_CHARS]


def _filters(sources: list[str] | None, kind: str | None, lang: str | None) -> list:
    f = [Passage.embedding.is_(None)]
    if sources:
        f.append(Passage.source_id.in_(sources))
    if kind:
        f.append(Passage.kind == kind)
    if lang:
        f.append(Passage.lang == lang)
    return f


async def estimate(sources: list[str] | None = None, kind: str | None = None, lang: str | None = None) -> dict:
    chars = func.least(func.length(Passage.quote_text) + func.length(Passage.context_text) + 2, MAX_CHARS)
    async with SessionLocal() as s:
        rows, total = (await s.execute(select(func.count(), func.coalesce(func.sum(chars), 0)).where(*_filters(sources, kind, lang)))).one()
    tokens = int(total / CHARS_PER_TOKEN)
    return {"rows": rows, "chars": int(total), "tokens_est": tokens, "usd_est": round(tokens * 0.01 / 1e6, 4)}


async def run(
    sources: list[str] | None = None,
    kind: str | None = None,
    lang: str | None = None,
    limit: int | None = None,
    batch: int = 64,
) -> dict:
    """Embed up to `limit` passages. Returns counts; stops cleanly on budget or outage."""
    done = 0
    stopped = None
    sources, mismatched = await _same_model(sources)
    if mismatched:
        log.warning("skipped (vectors of another model; re-embed with --reembed): %s", ", ".join(mismatched))
        if sources == []:
            return {"embedded": 0, "stopped": "model_mismatch"}
    # Fair share: batches rotate over every (source, language) with work left,
    # so one large group (islamqa Arabic) never starves another (islamqa
    # English) under the daily ceiling. Inside a group rows go by id.
    async with SessionLocal() as s:
        groups = [
            (sid, lg)
            for sid, lg in await s.execute(
                select(Passage.source_id, Passage.lang)
                .where(*_filters(sources, kind, lang))
                .group_by(Passage.source_id, Passage.lang)
                .order_by(Passage.source_id, Passage.lang)
            )
        ]
    turn = 0
    while groups and (limit is None or done < limit):
        size = batch if limit is None else min(batch, limit - done)
        sid, lg = groups[turn % len(groups)]
        async with SessionLocal() as s:
            rows = list(
                await s.scalars(
                    select(Passage)
                    .where(*_filters(sources, kind, lang), Passage.source_id == sid, Passage.lang == lg)
                    .order_by(Passage.id)
                    .limit(size)
                )
            )
        if not rows:
            groups.remove((sid, lg))  # this group is done; the next one takes its turn
            continue
        turn += 1
        vectors = None
        for attempt in range(RETRIES + 1):
            try:
                vectors = await client.embed([embed_text(p) for p in rows])
                break
            except BudgetExceeded:
                stopped = "budget"
                break
            except AiUnavailable as e:
                stopped = f"unavailable:{e}"
                if attempt < RETRIES:  # rate limit or provider hiccup: back off and retry
                    await asyncio.sleep(2 ** (attempt + 1))
        if vectors is None:
            break
        stopped = None
        async with SessionLocal() as s, s.begin():
            for p, v in zip(rows, vectors, strict=True):
                await s.execute(update(Passage).where(Passage.id == p.id, Passage.text_hash == p.text_hash).values(embedding=v))
        done += len(rows)
        if done % (batch * 20) == 0:
            log.info("embedded %d", done)
    return {"embedded": done, "stopped": stopped}


def _recorded_model(src: Source) -> str | None:
    return ((src.versions or {}).get("embedding") or {}).get("model")


async def _same_model(sources: list[str] | None) -> tuple[list[str] | None, list[str]]:
    """Sources whose existing vectors were made by the current model (or with
    no record yet). Returns (sources to embed or None for all, mismatched)."""
    model = get_settings().ai_embedding_model
    async with SessionLocal() as s:
        rows = list(await s.scalars(select(Source)))
    mismatched = [r.id for r in rows if _recorded_model(r) not in (None, model)]
    if not mismatched:
        return sources, []
    if sources is None:
        return [r.id for r in rows if r.id not in mismatched], mismatched
    return [x for x in sources if x not in mismatched], [x for x in sources if x in mismatched]


async def coverage(sources: list[str] | None = None) -> dict[str, dict[str, dict[str, Any]]]:
    """{source: {lang: {passages, embedded, remaining, pct}}} from the data."""
    stmt = select(Passage.source_id, Passage.lang, func.count(), func.count(Passage.embedding)).group_by(Passage.source_id, Passage.lang)
    if sources:
        stmt = stmt.where(Passage.source_id.in_(sources))
    out: dict[str, dict[str, dict[str, Any]]] = {}
    async with SessionLocal() as s:
        for sid, lang, n, e in await s.execute(stmt):
            out.setdefault(sid, {})[lang] = {
                "passages": n,
                "embedded": e,
                "remaining": n - e,
                "pct": round(100.0 * e / n, 2) if n else 0.0,
            }
    return out


async def record_coverage(sources: list[str] | None, result: dict[str, Any]) -> dict[str, Any]:
    """Write coverage, model, last run, last success and stop reason per source."""
    cov = await coverage(sources)
    now = datetime.now(UTC).isoformat(timespec="seconds")
    model = get_settings().ai_embedding_model
    async with SessionLocal() as s, s.begin():
        for src in await s.scalars(select(Source).where(Source.id.in_(list(cov)))):
            prev = (src.versions or {}).get("embedding") or {}
            if prev.get("model") not in (None, model):
                continue  # another model's vectors: left for --reembed, never relabelled
            langs = cov[src.id]
            remaining = sum(v["remaining"] for v in langs.values())
            entry = {
                "model": model,
                "langs": langs,
                "remaining": remaining,
                "ready": remaining == 0,
                "last_run": now,
                "last_success": now if result.get("embedded") or remaining == 0 else prev.get("last_success"),
                "stopped": result.get("stopped"),
            }
            src.versions = {**(src.versions or {}), "embedding": entry}
    return {sid: {lang: v["pct"] for lang, v in langs.items()} for sid, langs in cov.items()}


async def reembed(sources: list[str]) -> int:
    """Clear the vectors of `sources` so the current model re-embeds them (S19)."""
    async with SessionLocal() as s, s.begin():
        res = await s.execute(update(Passage).where(Passage.source_id.in_(sources)).values(embedding=None))
        for src in await s.scalars(select(Source).where(Source.id.in_(sources))):
            versions = dict(src.versions or {})
            versions["embedding"] = {
                "model": get_settings().ai_embedding_model,
                "ready": False,
                "reembed_at": datetime.now(UTC).isoformat(),
            }
            src.versions = versions
    return res.rowcount or 0


async def _main(a: argparse.Namespace) -> None:
    sources = a.source or None
    if a.reembed:
        if not sources:
            raise SystemExit("--reembed needs --source (it clears that source's vectors)")
        print(f"cleared vectors: {await reembed(sources)}")
    print(await estimate(sources, a.kind, a.lang))
    if a.estimate:
        print(await coverage(sources))
        return
    result = await run(sources, a.kind, a.lang, a.limit, a.batch)
    print(result)
    print(await record_coverage(sources, result))
    print(f"total AI spend so far: ${await client.spent():.4f}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    p = argparse.ArgumentParser()
    p.add_argument("--source", action="append")
    p.add_argument("--kind")
    p.add_argument("--lang")
    p.add_argument("--limit", type=int)
    p.add_argument("--batch", type=int, default=64)
    p.add_argument("--estimate", action="store_true")
    p.add_argument("--reembed", action="store_true", help="clear the given sources' vectors first (embedding model change)")
    asyncio.run(_main(p.parse_args()))
