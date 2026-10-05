"""KNW-02: load normalized source files (JSONL, see sources/_common.py) into
`knw_passages`.

R1 only sources whose mode is "index" in docs/agents/sources.md are loaded.
R2 text is stored exactly as the normalizer wrote it, with its source,
   id, language, version and origin URL.
R5 one source is replaced as a whole inside one transaction: every row of
   the new version is upserted and rows that vanished are removed, or
   nothing changes. Unchanged text keeps its embedding; changed text loses
   it so the embedder recomputes it.

Usage: python -m app.knowledge.load [source_id ...]   (default: every file)
"""

import argparse
import asyncio
import json
import logging
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path

from sqlalchemy import case, delete, select, text
from sqlalchemy.dialects.postgresql import insert

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.knowledge.models import Passage, Source

log = logging.getLogger("rafeeq.load")

# Mirrors docs/agents/sources.md (mode "index" only). A source missing here is never loaded.
SOURCES: dict[str, dict[str, str]] = {
    "quranenc": {
        "name": "QuranEnc — موسوعة القرآن الكريم",
        "url": "https://quranenc.com",
        "license": "ICSA: no modification; cite QuranEnc.com and version",
    },
    "hadeethenc": {
        "name": "HadeethEnc — موسوعة الأحاديث النبوية",
        "url": "https://hadeethenc.com",
        "license": "ICSA: no modification; cite HadeethEnc.com and version",
    },
    "islamqa": {
        "name": "الإسلام سؤال وجواب",
        "url": "https://islamqa.info",
        "license": "Owner decision 2026-10-05 (offline archive); permission request pending ⚠️",
    },
    "binbaz": {"name": "موقع الشيخ ابن باز", "url": "https://binbaz.org.sa", "license": "Copying permitted with citation (binbaz.org.sa)"},
    "islamhouse_enc": {
        "name": "موسوعة دار الإسلام (المختصر المفيد للمسلم الجديد)",
        "url": "https://enc.islamhouse.com",
        "license": "ICSA: apps, offline and AI use allowed; text unchanged",
    },
    "islamhouse": {
        "name": "IslamHouse",
        "url": "https://islamhouse.com",
        "license": "ICSA: apps, offline and AI use allowed; text unchanged",
    },
}

BATCH = 1000
COLUMNS = (
    "id",
    "source_id",
    "kind",
    "lang",
    "ref",
    "ref_key",
    "quote_text",
    "context_text",
    "meta",
    "version",
    "origin_url",
    "fetched_at",
    "text_hash",
)


def corpus_dir() -> Path:
    return get_settings().corpus_dir


def _rows(path: Path) -> Iterator[dict]:
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                d = json.loads(line)
                d["fetched_at"] = datetime.fromisoformat(d["fetched_at"].replace("Z", "+00:00"))
                yield {k: d[k] for k in COLUMNS}


async def load_source(source_id: str, path: Path) -> dict:
    meta = SOURCES.get(source_id)
    if meta is None:
        raise SystemExit(f"{source_id}: not an indexed source (KNW-02 R1)")
    seen: set[str] = set()
    versions: dict[str, int] = {}
    async with SessionLocal() as session, session.begin():
        await session.execute(text("SET LOCAL statement_timeout = 0"))
        await session.merge(Source(id=source_id, name=meta["name"], url=meta["url"], license=meta["license"], mode="index", versions={}))
        batch: list[dict] = []

        async def flush() -> None:
            stmt = insert(Passage).values(batch)
            changed = stmt.excluded.text_hash != Passage.text_hash
            await session.execute(
                stmt.on_conflict_do_update(
                    index_elements=[Passage.id],
                    set_={
                        **{c: stmt.excluded[c] for c in COLUMNS if c != "id"},
                        # keep the vector only when the text is identical
                        "embedding": case((Passage.text_hash == stmt.excluded.text_hash, Passage.embedding), else_=None),
                    },
                    where=changed | (stmt.excluded.version != Passage.version) | (stmt.excluded.meta != Passage.meta),
                )
            )
            batch.clear()

        for row in _rows(path):
            if row["source_id"] != source_id:
                raise SystemExit(f"{path}: row {row['id']} belongs to {row['source_id']}")
            seen.add(row["id"])
            versions[row["version"]] = versions.get(row["version"], 0) + 1
            batch.append(row)
            if len(batch) >= BATCH:
                await flush()
        if batch:
            await flush()

        existing = set(await session.scalars(select(Passage.id).where(Passage.source_id == source_id)))
        gone = existing - seen
        for chunk in [list(gone)[i : i + 5000] for i in range(0, len(gone), 5000)]:
            await session.execute(delete(Passage).where(Passage.id.in_(chunk)))
        src = await session.get(Source, source_id)
        src.versions = {"versions": versions, "count": len(seen), "loaded_at": datetime.now().astimezone().isoformat()}
    return {"source": source_id, "rows": len(seen), "removed": len(gone)}


async def main(ids: list[str]) -> None:
    root = corpus_dir()
    files = sorted(root.glob("*.jsonl"))
    for f in files:
        sid = f.stem
        if ids and sid not in ids:
            continue
        if sid not in SOURCES:
            log.warning("skip %s: not an indexed source", sid)
            continue
        log.info("loading %s", f)
        log.info("%s", await load_source(sid, f))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    p = argparse.ArgumentParser()
    p.add_argument("sources", nargs="*")
    asyncio.run(main(p.parse_args().sources))
