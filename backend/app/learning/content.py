"""Lesson content from `content/` (units.json + lessons/*.json), with the
Sharia reviewer's approvals applied per language.

rules.md §1.4 / LRN-01 R6: learners never receive text in a language the
reviewer has not approved. Approvals are bound to a hash of the exact text
(KNW-05 R3), so an edit after approval needs a new approval."""

import hashlib
import json
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from app.core.config import get_settings

LANGS = ("ar", "en", "tl")


@dataclass
class ContentStore:
    units: list[dict[str, Any]] = field(default_factory=list)
    lessons: dict[str, dict[str, Any]] = field(default_factory=dict)
    media: dict[str, Any] = field(default_factory=dict)

    def objective_ids(self) -> set[str]:
        return {o["id"] for lesson in self.lessons.values() for o in lesson.get("objectives", [])}

    def exercise(self, exercise_id: str) -> tuple[dict, dict] | None:
        for lesson in self.lessons.values():
            for ex in lesson.get("exercises", []):
                if ex["id"] == exercise_id:
                    return lesson, ex
        return None


@lru_cache
def store() -> ContentStore:
    root = get_settings().content_dir
    s = ContentStore()
    units_file = root / "units.json"
    if units_file.exists():
        s.units = json.loads(units_file.read_text(encoding="utf-8"))
    for f in sorted((root / "lessons").glob("*.json")) if (root / "lessons").exists() else []:
        lesson = json.loads(f.read_text(encoding="utf-8"))
        s.lessons[lesson["id"]] = lesson
    media = root / "day-one-media.json"
    if media.exists():
        s.media = json.loads(media.read_text(encoding="utf-8"))
    return s


def _lang_view(node: Any, lang: str) -> Any:
    """Keep only `lang` in every {ar,en,tl} object (for hashing and output)."""
    if isinstance(node, dict):
        if set(node.keys()) and set(node.keys()) <= set(LANGS):
            return node.get(lang, "")
        return {k: _lang_view(v, lang) for k, v in node.items() if k not in ("review_status", "dropped", "notes")}
    if isinstance(node, list):
        return [_lang_view(v, lang) for v in node]
    return node


def lesson_hash(lesson: dict, lang: str) -> str:
    view = _lang_view({k: lesson.get(k) for k in ("title", "cards", "objectives", "exercises")}, lang)
    return hashlib.sha256(json.dumps(view, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def unit_hash(unit: dict, lang: str) -> str:
    view = _lang_view({k: unit.get(k) for k in ("title", "badge_name", "source_credit")}, lang)
    return hashlib.sha256(json.dumps(view, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def _strip(node: Any, keep: set[str]) -> Any:
    """Remove every language not in `keep` from {ar,en,tl} objects."""
    if isinstance(node, dict):
        if set(node.keys()) and set(node.keys()) <= set(LANGS):
            return {k: v for k, v in node.items() if k in keep}
        return {k: _strip(v, keep) for k, v in node.items() if k not in ("review_status", "dropped", "notes", "source")}
    if isinstance(node, list):
        return [_strip(v, keep) for v in node]
    return node


def public_content(approved: dict[tuple[str, str, str], str], preview: bool = False) -> dict:
    """`approved` maps (item_type, item_id, lang) -> approved content hash.

    Learners get only approved languages. Team/reviewer accounts (`preview`)
    get everything, with `approved` still telling the truth."""
    s = store()
    lessons_out: dict[str, dict] = {}
    for lid, lesson in s.lessons.items():
        langs = [lg for lg in LANGS if approved.get(("lesson", lid, lg)) == lesson_hash(lesson, lg)]
        keep = set(LANGS) if preview else set(langs)
        out = _strip(lesson, keep)
        out["approved"] = langs
        lessons_out[lid] = out
    units_out = []
    for unit in s.units:
        langs = [
            lg
            for lg in LANGS
            if approved.get(("unit", unit["id"], lg)) == unit_hash(unit, lg)
            and any(lg in lessons_out[lid]["approved"] for lid in unit["lessons"] if lid in lessons_out)
        ]
        out = _strip(unit, set(LANGS) if preview else set(langs))
        out["approved"] = langs
        units_out.append(out)
    return {"units": units_out, "lessons": lessons_out, "media": s.media, "preview": preview}
