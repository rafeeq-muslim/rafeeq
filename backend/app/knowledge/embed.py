"""KNW-02 §3.6: embed passages with bge-m3 (via OpenRouter).

Selects passages whose `embedding` is NULL (new rows, and rows whose text
changed: the loader clears the vector when `text_hash` changes), so a run
resumes where the last one stopped. Each batch passes the AI spend guard
first and is written in its own transaction.

Usage:
  python -m app.knowledge.embed [--source quranenc] [--kind hadith] [--lang en]
                                [--limit 5000] [--batch 64] [--estimate]
"""

import argparse
import asyncio
import logging

from sqlalchemy import func, select, update

from app.core.db import SessionLocal
from app.knowledge.ai import client
from app.knowledge.ai.client import AiUnavailable, BudgetExceeded
from app.knowledge.models import Passage

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
    while limit is None or done < limit:
        size = batch if limit is None else min(batch, limit - done)
        async with SessionLocal() as s:
            rows = list(await s.scalars(select(Passage).where(*_filters(sources, kind, lang)).order_by(Passage.id).limit(size)))
        if not rows:
            break
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


async def _main(a: argparse.Namespace) -> None:
    sources = a.source or None
    print(await estimate(sources, a.kind, a.lang))
    if a.estimate:
        return
    print(await run(sources, a.kind, a.lang, a.limit, a.batch))
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
    asyncio.run(_main(p.parse_args()))
