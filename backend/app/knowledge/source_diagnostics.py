"""KNW-02 §5.3 / SC6: internal source diagnostics. Command line only; there
is no HTTP endpoint, so no user can widen the answer policy through it.

  python -m app.knowledge.source_diagnostics inventory
      the effective answer-source policy and, per source and language:
      configured, index mode, passages, vectors, coverage, effective or the
      exclusion reason (disabled_by_answer_config, mode_link, missing_source,
      no_passages_for_lang, embedding_pending, ...).

  python -m app.knowledge.source_diagnostics trace CASES.json [--sources islamqa,binbaz] [--ignore-config]
      for each fixture case {"id", "question", "lang", "expected": [passage or ref ids]}:
      ranked candidates with source_id, ref_key, passage_id, retrieval
      channel, rank, cosine similarity and RRF score (kept apart: they are
      different scales), selected_for_context and an exclusion reason, plus
      Recall@k against the expected ids. Run it per source ([islamqa],
      [binbaz]) and with the policy (no --sources) to compare (§5.3).
      `--ignore-config` searches sources outside KNW_ANSWER_SOURCES and is
      refused in production (only for a test index).

Output never contains the question text, answer text, passage text, keys
or identity: case ids, source ids, passage ids, ranks, scores and codes only.
"""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.knowledge import query_normalization, source_policy
from app.knowledge.models import Passage, Source
from app.knowledge.search import retrieve


async def inventory(session: AsyncSession) -> dict[str, Any]:
    configured = source_policy.configured_sources()
    elig = await source_policy.eligible_sources(session)
    rows = {s.id: s for s in await session.scalars(select(Source))}
    counts = await session.execute(
        select(Passage.source_id, Passage.lang, func.count(), func.count(Passage.embedding)).group_by(Passage.source_id, Passage.lang)
    )
    langs: dict[str, dict[str, dict[str, Any]]] = {}
    for sid, lang, n, e in counts:
        langs.setdefault(sid, {})[lang] = {"passages": n, "embedded": e, "pct": round(100.0 * e / n, 2) if n else 0.0}
    out: dict[str, Any] = {}
    for sid in dict.fromkeys([*source_policy.KNOWN_SOURCES, *rows]):
        src = rows.get(sid)
        per_lang = langs.get(sid, {})
        if sid in elig.sources:
            effective, reason = True, None
        elif sid not in configured:
            effective, reason = False, source_policy.DISABLED_BY_CONFIG
        else:
            effective, reason = False, elig.excluded.get(sid, source_policy.MISSING_SOURCE)
        notes = {lang: source_policy.EMBEDDING_PENDING for lang, v in per_lang.items() if v["embedded"] == 0 and v["passages"]}
        out[sid] = {
            "configured_for_answers": sid in configured,
            "in_database": src is not None,
            "index_mode": src.mode if src else None,
            "available_languages": per_lang,
            "embedding": ((src.versions or {}).get("embedding") if src else None),
            "vector_model_ok": source_policy.vector_model_ok(src) if src else None,
            "effective_for_answers": effective,
            "exclusion_reason": reason,
            "notes": notes,
        }
    return {
        "answer_sources": configured,
        "unknown_in_config": source_policy.unknown_configured(),
        "embedding_model": get_settings().ai_embedding_model,
        "sources": out,
    }


def _recall(expected: list[str], selected: list[dict[str, Any]]) -> float | None:
    if not expected:
        return None
    got = {c["passage_id"] for c in selected} | {f"{c['source_id']}:{c['ref_key']}" for c in selected}
    return round(sum(1 for e in expected if e in got) / len(expected), 4)


async def trace(
    session: AsyncSession,
    question: str,
    lang: str,
    *,
    sources: list[str] | None = None,
    enforce_config: bool = True,
    expected: list[str] | None = None,
) -> dict[str, Any]:
    """One fixture question through the same retrieval as the answer path."""
    q = query_normalization.build(question, lang)
    res = await retrieve(session, q.canonical, lang, sources=sources, version=q.version, enforce_config=enforce_config)
    rows = []
    for c in res.candidates:
        row = dict(c)
        row["retrieval_channel"] = row.pop("channel")
        row["cited_in_answer"] = None  # retrieval only; the answer path records citations per request
        row["exclusion_reason"] = None if c["selected_for_context"] else "context_limit"
        rows.append(row)
    selected = [r for r in rows if r["selected_for_context"]]
    return {
        "retrieval": res.trace(),
        "per_source": res.sources,
        "candidates": rows,
        "recall_at_k": _recall(expected or [], selected),
    }


async def _main(a: argparse.Namespace, cases: list[dict[str, Any]]) -> None:
    async with SessionLocal() as s:
        if a.cmd == "inventory":
            print(json.dumps(await inventory(s), ensure_ascii=False, indent=1))
            return
        if a.ignore_config and get_settings().is_production:
            raise SystemExit("--ignore-config is for a test index only, never production")
        sources = [x for x in a.sources.split(",") if x] if a.sources is not None else None
        report = []
        for case in cases:
            t = await trace(
                s, case["question"], case["lang"], sources=sources, enforce_config=not a.ignore_config, expected=case.get("expected")
            )
            report.append({"id": case["id"], "lang": case["lang"], **t})
        recalls = [r["recall_at_k"] for r in report if r["recall_at_k"] is not None]
        summary = {
            "cases": len(report),
            "with_expected": len(recalls),
            "mean_recall_at_k": round(sum(recalls) / len(recalls), 4) if recalls else None,
        }
        print(json.dumps({"summary": summary, "cases": report}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("inventory")
    t = sub.add_parser("trace")
    t.add_argument("cases")
    t.add_argument("--sources", help="comma list; empty string means no source")
    t.add_argument("--ignore-config", action="store_true")
    args = p.parse_args()
    asyncio.run(_main(args, json.loads(Path(args.cases).read_text(encoding="utf-8")) if args.cmd == "trace" else []))
