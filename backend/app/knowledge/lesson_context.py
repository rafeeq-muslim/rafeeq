"""CMP-01 R1 (owner's decision 2026-10-07): what the learner is looking at
when the assistant is opened from a lesson or a review.

The app sends ids only (lesson id plus the card id or the exercise id). The
text is loaded here from the content learners can read in the request
language (`review.published`, the same snapshot the lesson shows), so a
client can never put its own words in front of a model. Unknown ids, a
withdrawn lesson or another language give None: the question is then
answered as any other question.

Never here: the learner's answer, whether it was right, their progress, or
the exercise's correct answer (the options are listed in text order, not in
the stored order, so the block does not give the answer away).

The card text itself is a source only through the existing index
(`rafeeq_cards`, knowledge/cards.py): `passage_ids` names the passages of
the card on screen (or of the cards the exercise draws on); the answer path
adds the ones that exist in the index and are allowed by the source policy.
"""

from dataclasses import dataclass, field
from typing import Annotated, Any

from pydantic import BaseModel, StringConstraints
from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge import cards, review

ContextId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,32}$")]
TEXT_CHARS = 1400  # the block the router and the composer read
SEARCH_CHARS = 240  # what is added to the search form
ITEM_CHARS = 200


class ContextRef(BaseModel):
    """Ids only. Any other field a client adds is dropped by validation."""

    lesson_id: ContextId
    card_id: ContextId | None = None
    exercise_id: ContextId | None = None


@dataclass(frozen=True)
class LessonContext:
    kind: str  # exercise | card | lesson (codes only, for the trace)
    text: str
    search: str
    passage_ids: list[str] = field(default_factory=list)


def _one_line(text: Any) -> str:
    return " ".join(text.split()) if isinstance(text, str) else ""


def _texts(items: Any) -> list[str]:
    """Item texts in text order (never the stored order, which may be the answer)."""
    out = [_one_line(it.get("text"))[:ITEM_CHARS] for it in items or [] if isinstance(it, dict)]
    return sorted(t for t in out if t)


def _exercise_cards(lesson: dict, ex: dict) -> list[str]:
    """Cards the exercise draws on, else its objectives' cards (as knowledge.tasks.card_text)."""
    ids = list(ex.get("cards") or [])
    if not ids:
        objectives = {o.get("id"): o for o in lesson.get("objectives") or []}
        for oid in ex.get("objectives") or []:
            ids += objectives.get(oid, {}).get("cards") or []
    return list(dict.fromkeys(ids))


async def load(session: AsyncSession, ref: ContextRef | None, lang: str) -> LessonContext | None:
    if ref is None:
        return None
    cards._ensure_registered()
    lesson = (await review.published(session, "lesson", lang)).get(ref.lesson_id)
    if not isinstance(lesson, dict):
        return None
    if review.items("unit"):  # a lesson of a withdrawn unit is not shown (as knowledge.cards)
        unit_of = {it.item_id: it.group for it in review.items("lesson")}
        if unit_of.get(ref.lesson_id) not in await review.published(session, "unit", lang):
            return None
    title = _one_line(lesson.get("title"))
    if not title:
        return None
    lines = [f"LESSON: {title}"]
    kind, focus, card_ids = "lesson", "", []
    if ref.exercise_id:
        ex = next((e for e in lesson.get("exercises") or [] if e.get("id") == ref.exercise_id), None)
        if ex is None:
            return None
        kind, focus = "exercise", _one_line(ex.get("prompt"))
        lines.append(f"EXERCISE ON SCREEN: {focus}")
        for label, key in (("OPTIONS", "options"), ("STEPS TO ORDER", "items"), ("TO MATCH", "left"), ("WITH", "right")):
            texts = _texts(ex.get(key))
            if texts:
                lines.append(f"{label}:\n" + "\n".join(f"- {t}" for t in texts))
        card_ids = _exercise_cards(lesson, ex)
    elif ref.card_id:
        card = next((c for c in lesson.get("cards") or [] if c.get("id") == ref.card_id), None)
        if card is None:
            return None
        kind, focus = "card", (card.get("text") or "").strip() if isinstance(card.get("text"), str) else ""
        if focus:  # a verse-only card has no text of its own; its verse is never written here
            lines.append(f"CARD ON SCREEN:\n{focus}")
        card_ids = [ref.card_id]
    return LessonContext(
        kind=kind,
        text="\n".join(lines)[:TEXT_CHARS],
        search=f"{title} {_one_line(focus)}".strip()[:SEARCH_CHARS],
        passage_ids=[f"{cards.SOURCE_ID}:{lang}:{cid}" for cid in card_ids],
    )
