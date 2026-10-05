"""Screens that run before any model (no network):

- danger phrases (KNW-01 R5, rules.md §2.8, plan 4.2): a hit routes to a
  human immediately and no model is called;
- manipulation phrases (KNW-01 R6): a hit gets the fixed polite refusal;
- the learning-guide request "what should I learn now?" (KNW-10 R3).

Phrase lists live in content/knowledge/ so the Sharia reviewer and the
Companion owner can review them without reading code."""

import json
from functools import cache
from typing import Any

from app.core.config import get_settings
from app.knowledge.ai.textcheck import has_arabic, normalize

LANGS = ("ar", "en", "tl")


def _load(name: str) -> dict[str, Any]:
    return json.loads((get_settings().content_dir / "knowledge" / name).read_text(encoding="utf-8"))


@cache
def _phrases(kind: str) -> tuple[str, ...]:
    """Normalised phrases of every language: a Tagalog speaker may write in English."""
    data = _load("danger-phrases.json")["phrases"] if kind == "danger" else _load("screen-phrases.json")[kind]
    return tuple(sorted({normalize(p) for lg in LANGS for p in data.get(lg, []) if normalize(p)}))


def danger_phrases() -> tuple[str, ...]:
    return _phrases("danger")


def _hit(text: str, kind: str) -> bool:
    """Latin phrases match whole words; Arabic phrases match inside words too,
    because Arabic attaches particles and pronouns (وطردني، فطردوني)."""
    t = f" {normalize(text)} "
    return any((p in t) if has_arabic(p) else (f" {p} " in t) for p in _phrases(kind))


def is_danger(text: str) -> bool:
    return _hit(text, "danger")


def is_manipulation(text: str) -> bool:
    return _hit(text, "manipulation")


def is_learning_guide(text: str) -> bool:
    return _hit(text, "learning_guide")


@cache
def fixed_replies() -> dict[str, dict[str, str]]:
    return _load("fixed-replies.json")["replies"]


def fixed(kind: str, lang: str) -> str:
    r = fixed_replies()[kind]
    return r.get(lang) or r["en"]


def approved_answers() -> list[dict[str, Any]]:
    return [a for a in _load("approved-answers.json").get("answers", []) if a.get("status") == "approved"]
