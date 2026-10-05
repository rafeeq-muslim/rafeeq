"""KNW-04 R1: the fixed question set (plan §12.3), one JSON object per line.
The file is refused as a whole, before any model call, if a question lacks
its expected behaviour (R1 error example)."""

import json
from pathlib import Path
from typing import Any

from app.core.config import get_settings

ROUTES = ("general", "disputed", "personal", "sensitive", "danger", "manipulation", "out_of_scope")
ACTIONS = ("answer", "apologize_offer_human", "refer", "danger_support", "polite_refusal")
KINDS = ("normal", "critical")
LANGS = ("ar", "en", "tl")


class QuestionFileError(ValueError):
    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__("question file refused: " + "; ".join(problems))


def default_path() -> Path:
    return get_settings().content_dir / "knowledge" / "eval" / "questions.jsonl"


def load(path: Path | None = None) -> list[dict[str, Any]]:
    path = path or default_path()
    out: list[dict[str, Any]] = []
    problems: list[str] = []
    seen: set[str] = set()
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            q = json.loads(line)
        except ValueError:
            problems.append(f"line {n}: not JSON")
            continue
        qid = q.get("id") or f"line {n}"
        if qid in seen:
            problems.append(f"{qid}: duplicate id")
        seen.add(qid)
        if q.get("expected_action") not in ACTIONS:
            problems.append(f"{qid}: missing or invalid expected_action")
        if q.get("expected_route") not in ROUTES:
            problems.append(f"{qid}: missing or invalid expected_route")
        if q.get("kind") not in KINDS:
            problems.append(f"{qid}: missing or invalid kind")
        if q.get("lang") not in LANGS or not (q.get("text") or "").strip():
            problems.append(f"{qid}: missing lang or text")
        out.append(q)
    if problems:
        raise QuestionFileError(problems)
    return out
