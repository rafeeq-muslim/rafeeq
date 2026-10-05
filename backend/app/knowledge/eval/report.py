"""KNW-04 R5 report (plan §5.8), generated from the stored answers alone and
published as it comes out:
1 summary, Rafeeq and the bare model side by side · 2 by route and by
language · 3 every failure with its text and reason · 4 «لم تغطّه المصادر» ·
5 the assistant's limits · 6 what is needed to re-run."""

from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge.eval.grade import question_verdict
from app.knowledge.models import EvalAnswer, EvalRun

LIMITS = [
    "Answers come only from the indexed sources in the asker's language; Tagalog has fewer passages, so more apologies are expected there.",
    "The code checks cannot detect a verse or hadith written by the model from outside the retrieved passages without quotation marks; the Sharia reviewer reads every Arabic answer for this (plan §4.6 check 7).",
    "Content verdicts on normal questions are the Sharia reviewer's; until given they are 'pending review' and never counted as passed.",
    "The bare model's verdicts are manual (plan §5.7); the hints shown are automatic heuristics only.",
    "No country helpline numbers are shown in danger cases yet; the human-help button is the only action.",
]


def _pct(n: int, d: int) -> str:
    return f"{(100 * n / d):.0f}% ({n}/{d})" if d else "—"


async def build(session: AsyncSession, ev: EvalRun, questions: list[dict[str, Any]]) -> dict[str, Any]:
    attempts = int(ev.settings.get("attempts", 3))
    rows = list(await session.scalars(select(EvalAnswer).where(EvalAnswer.run_id == ev.id)))
    by_q: dict[tuple[str, str], list[EvalAnswer]] = defaultdict(list)
    for a in rows:
        by_q[(a.question_id, a.system)].append(a)

    verdicts: dict[str, dict[str, Any]] = {}
    for q in questions:
        verdicts[q["id"]] = question_verdict(q, by_q.get((q["id"], "rafeeq"), []), attempts)

    def rate(qs: list[dict], status: str = "pass") -> list[int]:
        return [sum(1 for q in qs if verdicts[q["id"]]["status"] == status), len(qs)]

    crit = [q for q in questions if q["kind"] == "critical"]
    norm = [q for q in questions if q["kind"] == "normal"]
    bare_hints = defaultdict(int)
    bare_n = 0
    for q in questions:
        for a in by_q.get((q["id"], "bare"), []):
            bare_n += 1
            if q["expected_action"] == "danger_support" and a.checks.get("gave_content"):
                bare_hints["gave_content_in_danger"] += 1
            if a.checks.get("claims_prophet_said"):
                bare_hints["claims_prophet_said"] += 1
            if q["kind"] == "normal" and a.checks.get("cites_checkable_source"):
                bare_hints["normal_with_checkable_source"] += 1

    summary = {
        "rafeeq": {
            "critical": rate(crit),
            "normal_pass": rate(norm),
            "normal_pending_review": rate(norm, "pending_review")[0],
            "normal_not_covered": rate(norm, "not_covered")[0],
            "incomplete": sum(1 for v in verdicts.values() if v["status"] == "incomplete"),
        },
        "bare": {"answers": bare_n, "hints": dict(bare_hints), "verdict": "manual review (plan §5.7)"},
    }
    groups: dict[str, dict[str, list[int]]] = {"route": defaultdict(lambda: [0, 0]), "lang": defaultdict(lambda: [0, 0])}
    for q in questions:
        ok = verdicts[q["id"]]["status"] == "pass"
        for g, key in (("route", q["expected_route"]), ("lang", q["lang"])):
            groups[g][key][1] += 1
            groups[g][key][0] += int(ok)
    failures = [
        {"id": q["id"], "lang": q["lang"], "kind": q["kind"], "text": q["text"], "reason": verdicts[q["id"]].get("reason", "")}
        for q in questions
        if verdicts[q["id"]]["status"] in ("fail", "incomplete")
    ]
    not_covered = [{"id": q["id"], "lang": q["lang"], "text": q["text"]} for q in questions if verdicts[q["id"]]["status"] == "not_covered"]
    out = {
        "run_id": str(ev.id),
        "status": ev.status,
        "summary": summary,
        "by_route": {k: v for k, v in groups["route"].items()},
        "by_lang": {k: v for k, v in groups["lang"].items()},
        "verdicts": verdicts,
        "failures": failures,
        "not_covered": not_covered,
        "limits": LIMITS,
        "settings": ev.settings,
    }
    out["markdown"] = markdown(out)
    return out


def markdown(r: dict[str, Any]) -> str:
    s = r["summary"]
    c, n = s["rafeeq"]["critical"], s["rafeeq"]["normal_pass"]
    lines = [
        "# Rafeeq answer reliability test (KNW-04)",
        "",
        f"Run `{r['run_id']}` · status **{r['status']}** · {r['settings'].get('date', '')}",
        "",
        "## 1. Summary",
        "",
        "| | Rafeeq | Bare model |",
        "| --- | --- | --- |",
        f"| Critical cases passed (all 3 runs) | {_pct(*c)} | manual review |",
        f"| Normal cases passed (checks + Sharia reviewer) | {_pct(*n)} | manual review |",
        f"| Normal cases awaiting the reviewer | {s['rafeeq']['normal_pending_review']} | — |",
        f"| Normal cases not covered by the sources | {s['rafeeq']['normal_not_covered']} | — |",
        f"| Questions with missing attempts | {s['rafeeq']['incomplete']} | — |",
        f"| Bare model: gave content in a danger case | — | {s['bare']['hints'].get('gave_content_in_danger', 0)} answers |",
        f"| Bare model: «the Prophet said» written by the model | — | {s['bare']['hints'].get('claims_prophet_said', 0)} answers |",
        f"| Bare model: normal answers naming a checkable source | — | {s['bare']['hints'].get('normal_with_checkable_source', 0)} answers |",
        "",
        "## 2. By route and by language (Rafeeq, questions passed)",
        "",
        "| Route | Passed |",
        "| --- | --- |",
        *[f"| {k} | {_pct(*v)} |" for k, v in sorted(r["by_route"].items())],
        "",
        "| Language | Passed |",
        "| --- | --- |",
        *[f"| {k} | {_pct(*v)} |" for k, v in sorted(r["by_lang"].items())],
        "",
        "## 3. Failures",
        "",
    ]
    lines += [f"- **{f['id']}** ({f['lang']}, {f['kind']}): {f['text']}  \n  {f['reason']}" for f in r["failures"]] or ["None."]
    lines += ["", "## 4. Not covered by the sources (لم تغطّه المصادر)", ""]
    lines += [f"- **{x['id']}** ({x['lang']}): {x['text']}" for x in r["not_covered"]] or ["None."]
    lines += ["", "## 5. Limits", "", *[f"- {x}" for x in r["limits"]], "", "## 6. To re-run", ""]
    st = r["settings"]
    lines += [
        f"- Models: main `{st.get('model_main')}`, fast `{st.get('model_fast')}`, fallback `{st.get('model_fallback')}`; temperature {st.get('temperature')}",
        f"- Embedding model: `{st.get('embedding_model')}`; k = {st.get('search_k')}; similarity threshold = {st.get('min_similarity')}",
        f"- Sources: {st.get('answer_sources')}; versions: {st.get('source_versions')}",
        f"- Commit `{st.get('commit')}`, date {st.get('date')}, attempts {st.get('attempts')}",
        "- Command: `cd backend && uv run python -m app.knowledge.eval run`",
    ]
    return "\n".join(lines) + "\n"
