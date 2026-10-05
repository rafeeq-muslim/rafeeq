"""Lesson content from `content/` (units.json + lessons/*.json), with the
Sharia reviewer's approvals applied per language.

rules.md §1.4 / LRN-01 R6: learners never receive text in a language the
reviewer has not approved. Lessons and units are registered with the KNW-05
review desk; learners are served the approved snapshot (KNW-05 R3)."""

import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from app.core.config import get_settings
from app.knowledge import review
from app.knowledge.review import ReviewItem
from app.learning import team_units

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
    # Units written by the Learning team replace pipeline units of the same order.
    for unit, lessons in team_units.load(root):
        for old in [u for u in s.units if u.get("order") == unit["order"] or u["id"] == unit["id"]]:
            for lid in old.get("lessons", []):
                s.lessons.pop(lid, None)
            s.units.remove(old)
        s.units.append(unit)
        s.lessons.update({lesson["id"]: lesson for lesson in lessons})
    s.units.sort(key=lambda u: u.get("order", 0))
    return s


def lang_view(node: Any, lang: str) -> Any:
    """Keep only `lang` in every {ar,en,tl} object: what a learner reads."""
    if isinstance(node, dict):
        if node and set(node) <= set(LANGS):
            return node.get(lang, "")
        return {k: lang_view(v, lang) for k, v in node.items() if k not in _PRIVATE}
    if isinstance(node, list):
        return [lang_view(v, lang) for v in node]
    return node


_PRIVATE = ("review_status", "dropped", "notes")
LESSON_TEXT = ("title", "cards", "objectives", "exercises", "source", "media")
UNIT_TEXT = ("title", "badge_name", "source_credit")


def _has(text: Any, lang: str) -> bool:
    return isinstance(text, dict) and bool(text.get(lang))


def _review_items() -> Iterable[ReviewItem]:
    s = store()
    unit_order = {u["id"]: u.get("order", i) for i, u in enumerate(s.units)}
    for u in s.units:
        yield ReviewItem(
            "unit",
            u["id"],
            order=(unit_order[u["id"]],),
            views={lg: lang_view({k: u.get(k) for k in UNIT_TEXT}, lg) for lg in LANGS if _has(u.get("title"), lg)},
        )
    for lid, lesson in s.lessons.items():
        yield ReviewItem(
            "lesson",
            lid,
            order=(unit_order.get(lesson.get("unit"), 99), lesson.get("order", 0)),
            group=lesson.get("unit", ""),
            views={lg: lang_view({k: lesson.get(k) for k in LESSON_TEXT}, lg) for lg in LANGS if _has(lesson.get("title"), lg)},
        )


review.register("unit", lambda: (i for i in _review_items() if i.item_type == "unit"))
review.register("lesson", lambda: (i for i in _review_items() if i.item_type == "lesson"))


def build_content(lang: str, units_live: dict[str, Any], lessons_live: dict[str, Any], preview: bool) -> dict:
    """The path in one language (LRN-01 R6, KNW-05 R1/R3/R6).

    Learners get the approved snapshot of each lesson and unit, never the
    working text. A unit shows when it and at least one of its lessons are
    approved. Team accounts can `preview` the working text; `approved` and
    `changed` still tell them what learners see."""
    s = store()
    lessons: dict[str, dict] = {}
    for lid, lesson in s.lessons.items():
        current = lang_view({k: lesson.get(k) for k in LESSON_TEXT}, lang) if _has(lesson.get("title"), lang) else None
        live = lessons_live.get(lid)
        view = current if preview else live
        if view is None:
            continue
        lessons[lid] = {
            **view,
            "id": lid,
            "unit": lesson.get("unit"),
            "order": lesson.get("order", 0),
            "approved": live is not None,
            "changed": live is not None and current is not None and live != current,
        }
    units = []
    for i, u in enumerate(s.units):
        current = lang_view({k: u.get(k) for k in UNIT_TEXT}, lang) if _has(u.get("title"), lang) else None
        live = units_live.get(u["id"])
        view = current if preview else live
        ids = [lid for lid in u.get("lessons", []) if lid in lessons]
        if view is None or not ids:
            continue
        units.append({**view, "id": u["id"], "order": u.get("order", i + 1), "lessons": ids, "approved": live is not None})
    return {"lang": lang, "preview": preview, "units": units, "lessons": lessons}
