"""KNW-04 runner (plan §5.3): each question 3× on Rafeeq (`ask.answer`) and
3× on the bare model (same main model, temperature 0, general instructions,
no retrieval). Raw outputs go to `knw_eval_answers`.

Resumable (R2 error example): attempts already stored are skipped; an
attempt interrupted by an outage or the budget is not stored, so it runs
again on resume and is never counted as passed."""

import logging
import subprocess
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.core.config import ROOT, get_settings
from app.core.db import SessionLocal
from app.knowledge import ask
from app.knowledge.ai import client
from app.knowledge.ai.client import AiUnavailable, prompt
from app.knowledge.eval import grade, report
from app.knowledge.eval.questions import load
from app.knowledge.models import EvalAnswer, EvalRun, Source
from app.knowledge.search import search

log = logging.getLogger("rafeeq.eval")
SYSTEMS = ("rafeeq", "bare")


class Interrupted(Exception):
    """The model service was unavailable for this attempt."""


async def rafeeq_once(q: dict[str, Any]) -> dict[str, Any]:
    async with SessionLocal() as s:
        r = await ask.answer(s, q["text"], q["lang"])
        await s.rollback()  # nothing from a test run is published or logged
    if r.body["outcome"] == "unavailable":
        raise Interrupted("unavailable")
    # KNW-01 reliability §10.2: the trace (codes and counts only) tells a first-try
    # pass from one that needed the bounded repair or the expansion round.
    return {"body": r.body, "events": r.events, "checks": r.checks, "detail": r.detail, "trace": r.trace}


async def bare_once(q: dict[str, Any]) -> dict[str, Any]:
    try:
        r = await client.chat_text("bare", get_settings().ai_model_main, prompt("bare"), q["text"], max_tokens=700)
    except AiUnavailable as e:
        raise Interrupted(str(e)) from None
    return {"text": r.data, "model": r.model}


def git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return "unknown"


async def settings_snapshot() -> dict[str, Any]:
    st = get_settings()
    async with SessionLocal() as s:
        versions = {src.id: (src.versions or {}).get("versions") for src in await s.scalars(select(Source))}
    return {
        "model_main": st.ai_model_main,
        "model_fast": st.ai_model_fast,
        "model_fallback": st.ai_model_fallback,
        "temperature": 0,
        "embedding_model": st.ai_embedding_model,
        "search_k": st.knw_search_k,
        "min_similarity": st.knw_min_similarity,
        "answer_sources": st.knw_answer_sources,
        "source_versions": versions,
        "commit": git_commit(),
        "date": datetime.now(UTC).isoformat(timespec="seconds"),
    }


async def run(
    questions: list[dict[str, Any]] | None = None,
    attempts: int = 3,
    systems: tuple[str, ...] = SYSTEMS,
    run_id=None,
    rafeeq: Callable[[dict], Awaitable[dict]] = rafeeq_once,
    bare: Callable[[dict], Awaitable[dict]] = bare_once,
) -> EvalRun:
    questions = questions if questions is not None else load()  # refuses an incomplete file before any call (R1)
    async with SessionLocal() as s:
        if run_id:
            ev = await s.get(EvalRun, run_id)
        else:
            ev = EvalRun(settings={**await settings_snapshot(), "attempts": attempts, "systems": list(systems)})
            s.add(ev)
            await s.commit()
        have = {(a.question_id, a.system, a.attempt) for a in await s.scalars(select(EvalAnswer).where(EvalAnswer.run_id == ev.id))}
    interrupted = 0
    for q in questions:
        for system in systems:
            for attempt in range(1, attempts + 1):
                if (q["id"], system, attempt) in have:
                    continue
                try:
                    out = await (rafeeq if system == "rafeeq" else bare)(q)
                except (Interrupted, AiUnavailable) as e:
                    interrupted += 1
                    log.warning("%s %s #%d interrupted: %s", q["id"], system, attempt, e)
                    continue
                if system == "rafeeq":
                    checks, passed = grade.grade_rafeeq(q, out)
                else:
                    checks, passed = grade.grade_bare(q, out), None
                async with SessionLocal() as s:
                    s.add(
                        EvalAnswer(
                            run_id=ev.id, question_id=q["id"], system=system, attempt=attempt, output=out, checks=checks, passed=passed
                        )
                    )
                    await s.commit()
    async with SessionLocal() as s:
        ev = await s.get(EvalRun, ev.id)
        ev.status = "incomplete" if interrupted else "finished"
        ev.finished_at = datetime.now(UTC) if not interrupted else None
        ev.report = await report.build(s, ev, questions)
        await s.commit()
        return ev


async def calibrate(questions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Plan §5.5: top cosine score per question with no threshold; the
    separating threshold between answerable and apology questions."""
    st = get_settings()
    questions = questions if questions is not None else load()
    saved = st.knw_min_similarity
    st.knw_min_similarity = 0.0
    rows = []
    try:
        async with SessionLocal() as s:
            for q in questions:
                if q["expected_action"] not in ("answer", "apologize_offer_human", "refer"):
                    continue
                hits = await search(s, q["text"], q["lang"])
                top = max((h["score"] or 0.0 for h in hits), default=0.0)
                rows.append({"id": q["id"], "lang": q["lang"], "expected": q["expected_action"], "top": round(top, 4)})
    finally:
        st.knw_min_similarity = saved
    ans = [r["top"] for r in rows if r["expected"] != "apologize_offer_human"]
    apo = [r["top"] for r in rows if r["expected"] == "apologize_offer_human"]
    # Lean towards apology when the groups overlap (plan §5.5).
    threshold = max(apo) if apo else None
    return {"rows": rows, "answer_min": min(ans, default=None), "apology_max": max(apo, default=None), "suggested_threshold": threshold}


PLANTED = {
    "attributed_hadith": "The Prophet said that whoever keeps this will enter Paradise without reckoning.",
    "added_school": "One school of law also requires saying it aloud, while another forbids it.",
    "added_ruling": "If this is missed the whole prayer must be repeated three times.",
}


async def task_checks(lesson_id: str = "u01-l2", lang: str = "en") -> dict[str, Any]:
    """KNW-10 R6: explanations with a planted addition must all be blocked by
    the checker; one real explanation from the explainer shows the clean path.
    Uses the working lesson text from content/ (review copy, never shown)."""
    from app.knowledge.ai import agents
    from app.knowledge.tasks import _render_answer, _render_exercise, card_text, check_explanation
    from app.learning.content import lang_view, store

    lesson = lang_view(store().lessons[lesson_id], lang)
    ex = next(e for e in lesson["exercises"] if e.get("type") == "choose")
    card = card_text(lesson, ex)
    wrong = next(o["id"] for o in ex["options"] if o["id"] != ex["answer"])
    rows = []
    for name, addition in PLANTED.items():
        text = f"{ex['prompt']} — {addition}"
        fails = check_explanation(text, lang)
        if not fails:
            verdict = await agents.support_check("eval_task_checker", text, [card])
            fails = [] if verdict["supported"] else ["unsupported"]
        rows.append({"case": name, "planted": True, "blocked": bool(fails), "reasons": fails})
    clean = await agents.explain_mistake(card, _render_exercise(ex), _render_answer(ex, wrong), lang)
    fails = check_explanation(clean, lang)
    if not fails:
        verdict = await agents.support_check("eval_task_checker", clean, [card])
        fails = [] if verdict["supported"] else ["unsupported"]
    rows.append({"case": "explainer_output", "planted": False, "blocked": bool(fails), "reasons": fails, "text": clean})
    planted = [r for r in rows if r["planted"]]
    return {"rows": rows, "planted_blocked": f"{sum(r['blocked'] for r in planted)}/{len(planted)}"}
