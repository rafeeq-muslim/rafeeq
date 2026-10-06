"""KNW-02: load normalized source files (JSONL, see sources/_common.py) into
`knw_passages`.

R1 only sources whose mode is "index" in docs/agents/sources.md are loaded.
R2 text is stored exactly as the normalizer wrote it, with its source,
   id, language, version and origin URL.
R5 one source is replaced as a whole inside one transaction: every row of
   the new version is upserted and rows that vanished are removed, or
   nothing changes. Unchanged text keeps its embedding; changed text loses
   it so the embedder recomputes it.

KNW-02 SC2 (a load never succeeds on missing or broken data):
- a source named on the command line without its file fails clearly;
- an empty file, a line that is not JSON, a row missing a required field,
  a row of another source or a repeated id refuses the whole source;
- an optional `<source>.manifest.json` ({"rows": N, "complete": true}) next
  to the file must match the rows read;
- a new file with more than `MAX_SHRINK` fewer rows than the database holds
  is refused (a broken download must never delete a good corpus); an
  intended large removal needs `--allow-shrink`.
A refusal rolls the transaction back, so the previous corpus stays whole.

Usage: python -m app.knowledge.load [source_id ...] [--allow-shrink]   (default: every file)
"""

import argparse
import asyncio
import json
import logging
import sys
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
MAX_SHRINK = 0.10  # refuse a file with more than 10% fewer rows than the database holds
REQUIRED = ("id", "source_id", "kind", "lang", "ref_key", "quote_text", "version", "origin_url", "fetched_at", "text_hash")
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


class LoadRefused(Exception):
    """The file cannot replace the stored source; nothing was changed."""


def _rows(path: Path) -> Iterator[dict]:
    with path.open(encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                d = json.loads(line)
                missing = [k for k in REQUIRED if not d.get(k)]
                if missing:
                    raise LoadRefused(f"{path.name}:{n}: missing {', '.join(missing)}")
                d["fetched_at"] = datetime.fromisoformat(d["fetched_at"].replace("Z", "+00:00"))
                yield {k: d.get(k, {} if k in ("ref", "meta") else "") for k in COLUMNS}
            except (ValueError, TypeError, AttributeError) as e:
                raise LoadRefused(f"{path.name}:{n}: not a valid row ({type(e).__name__})") from None


def _manifest(path: Path) -> dict | None:
    if not path.exists():
        raise LoadRefused(f"{path.stem}: file not found: {path}")
    m = path.with_name(f"{path.stem}.manifest.json")
    if not m.exists():
        return None
    try:
        return json.loads(m.read_text(encoding="utf-8"))
    except ValueError:
        raise LoadRefused(f"{m.name}: not valid JSON") from None


async def load_source(source_id: str, path: Path, *, allow_shrink: bool = False) -> dict:
    meta = SOURCES.get(source_id)
    if meta is None:
        raise SystemExit(f"{source_id}: not an indexed source (KNW-02 R1)")
    manifest = _manifest(path)
    if manifest is not None and manifest.get("complete") is False:
        raise LoadRefused(f"{source_id}: the export is marked incomplete in its manifest")
    seen: set[str] = set()
    versions: dict[str, int] = {}
    async with SessionLocal() as session, session.begin():
        await session.execute(text("SET LOCAL statement_timeout = 0"))
        before = await session.get(Source, source_id)
        kept = {"embedding": before.versions["embedding"]} if before and (before.versions or {}).get("embedding") else {}
        await session.merge(Source(id=source_id, name=meta["name"], url=meta["url"], license=meta["license"], mode="index", versions=kept))
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
                raise LoadRefused(f"{path}: row {row['id']} belongs to {row['source_id']}")
            if row["id"] in seen:
                raise LoadRefused(f"{path}: repeated id {row['id']}")
            seen.add(row["id"])
            versions[row["version"]] = versions.get(row["version"], 0) + 1
            batch.append(row)
            if len(batch) >= BATCH:
                await flush()
        if batch:
            await flush()

        if not seen:
            raise LoadRefused(f"{source_id}: {path.name} has no rows")
        if manifest is not None and manifest.get("rows") is not None and int(manifest["rows"]) != len(seen):
            raise LoadRefused(f"{source_id}: manifest says {manifest['rows']} rows, the file has {len(seen)}")
        existing = set(await session.scalars(select(Passage.id).where(Passage.source_id == source_id)))
        if existing and len(seen) < len(existing) * (1 - MAX_SHRINK) and not allow_shrink:
            raise LoadRefused(
                f"{source_id}: {len(seen)} rows would replace {len(existing)} (more than {int(MAX_SHRINK * 100)}% fewer); "
                "refused for review (use --allow-shrink for an intended removal)"
            )
        gone = existing - seen
        for chunk in [list(gone)[i : i + 5000] for i in range(0, len(gone), 5000)]:
            await session.execute(delete(Passage).where(Passage.id.in_(chunk)))
        src = await session.get(Source, source_id)
        src.versions = {
            **kept,
            "versions": versions,
            "count": len(seen),
            "complete": True,
            "loaded_at": datetime.now().astimezone().isoformat(),
        }
    return {"source": source_id, "rows": len(seen), "removed": len(gone)}


def _plan(root: Path, ids: list[str]) -> tuple[list[Path], int]:
    """Files to load; a requested source without its file is a failure, never a silent skip."""
    if not ids:
        return sorted(root.glob("*.jsonl")), 0
    files, failed = [], 0
    for sid in dict.fromkeys(ids):
        f = root / f"{sid}.jsonl"
        if sid not in SOURCES:
            log.error("%s: not an indexed source (KNW-02 R1)", sid)
            failed += 1
        elif not f.exists():
            log.error("%s: requested, but %s does not exist", sid, f)
            failed += 1
        else:
            files.append(f)
    return files, failed


async def main(ids: list[str], allow_shrink: bool = False) -> int:
    """Load the requested sources (default: every file). Returns the number of
    sources that failed; each failure leaves that source as it was."""
    files, failed = _plan(corpus_dir(), ids)
    for f in files:
        sid = f.stem
        if sid not in SOURCES:
            log.warning("skip %s: not an indexed source", sid)
            continue
        log.info("loading %s", f)
        try:
            log.info("%s", await load_source(sid, f, allow_shrink=allow_shrink))
        except LoadRefused as e:
            log.error("refused, %s kept as it was: %s", sid, e)
            failed += 1
    return failed


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    p = argparse.ArgumentParser()
    p.add_argument("sources", nargs="*")
    p.add_argument("--allow-shrink", action="store_true", help="accept a file with many fewer rows (an intended removal)")
    a = p.parse_args()
    sys.exit(1 if asyncio.run(main(a.sources, a.allow_shrink)) else 0)
