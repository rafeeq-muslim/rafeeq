"""KNW-10: the assistant's learning tasks, with the same model and guards as
the sourced answer (KNW-01).

- POST /api/learning/explain (LRN-03 R6): reword the approved card text of
  the exercise's objective in the learner's language. The card is the only
  passage; the checker rejects anything added. Any problem → {"text": null}
  and the app shows the card text alone (no technical error).
- POST /api/learning/guide (LRN-07): the learning guide's message, written
  from the on-device learning summary only; checked; never stored.
- tag_question (LRN-10 R5): with the learner's consent only, map an answered
  question to one approved objective id.
"""

import json
import re
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.core import clientkey, limits
from app.core.db import release
from app.core.deps import OptionalUser, Session, require_role
from app.knowledge import glossary
from app.knowledge.ai import agents, gate
from app.knowledge.ai.client import AiUnavailable
from app.knowledge.ai.textcheck import ATTRIBUTION, TRANSLIT, has_arabic, quoted_spans, words
from app.knowledge.models import ExplanationLog
from app.knowledge.request_context import call_budget
from app.knowledge.review import published
from app.learning import content as learning_content
from app.learning.models import ExplanationBlock
from app.platform.models import User

router = APIRouter(prefix="/api/learning", tags=["learning-assistant"])
Lang = Literal["ar", "en", "tl"]
EXPLAIN_MAX_WORDS = 60  # LRN-03 R6
GUIDE_MAX_SENTENCES = 3  # LRN-07 R1
GUIDE_MAX_WORDS = 30  # LRN-07 R1 "about 25 words"; R4: a longer message falls back to the fixed one
GUIDE_MAX_NAMES_PER_SENTENCE = 2  # LRN-07 R1 (PR #18)
_BLAME = re.compile(
    r"\b(missed|absence|away for|days ago|been away|skipped|fell behind|nawala ka|hindi ka nakapag|lumiban)\b|غبت|غيابك|فاتك|انقطعت|تأخرت|قصّرت|قصرت",
    re.I,
)
# Security audit 2026-10-07 A-H3: paid calls and seconds one request may use
# (JSON retries and the fallback model included). Normal use: 2 calls each
# (writer + checker). The app waits 8 s for an explanation and 10 s for the guide.
EXPLAIN_MAX_CALLS, EXPLAIN_SECONDS = 4, 12.0
GUIDE_MAX_CALLS, GUIDE_SECONDS = 4, 12.0


# --- explain (LRN-03 R6, KNW-10 R1/R2/R4) -------------------------------------


class ExplainIn(BaseModel):
    lesson_id: str = Field(min_length=1, max_length=16)
    exercise_id: str = Field(min_length=1, max_length=24)
    lang: Lang
    answer: Any = None

    @field_validator("answer")
    @classmethod
    def small(cls, v: Any) -> Any:
        if len(json.dumps(v, ensure_ascii=False)) > 2000:
            raise ValueError("answer too large")
        return v


def _items(ex: dict) -> dict[str, str]:
    out = {}
    for key in ("options", "items", "left", "right"):
        for it in ex.get(key) or []:
            out[it["id"]] = it.get("text") or ""
    return out


def _render_answer(ex: dict, answer: Any) -> str:
    names = _items(ex)
    if isinstance(answer, str):
        return names.get(answer, answer)[:300]
    if isinstance(answer, list):
        parts = []
        for a in answer[:20]:
            if isinstance(a, list | tuple) and len(a) == 2:
                parts.append(f"{names.get(str(a[0]), str(a[0]))} → {names.get(str(a[1]), str(a[1]))}")
            else:
                parts.append(names.get(str(a), str(a)))
        return "; ".join(parts)[:600]
    return ""


def answer_belongs(ex: dict, answer: Any) -> bool:
    """Security review 2026-10-07 (B-L2): the learner's answer is one of the
    exercise's own ids (choose), a list of them (order) or pairs of them
    (match). Anything else, such as free text, never reaches the prompt."""
    ids = set(_items(ex))

    def known(a: Any) -> bool:
        return isinstance(a, str) and a in ids

    if answer is None:
        return True  # nothing chosen: the explanation rests on the card alone
    if isinstance(answer, str):
        return known(answer)
    if isinstance(answer, list) and len(answer) <= 20:
        return all(known(a) or (isinstance(a, list) and len(a) == 2 and known(a[0]) and known(a[1])) for a in answer)
    return False


def _render_exercise(ex: dict) -> str:
    lines = [ex.get("prompt") or ""]
    if ex.get("options"):
        lines += [f"- {o['text']}" for o in ex["options"]]
    lines.append("CORRECT ANSWER: " + _render_answer(ex, ex.get("answer")))
    return "\n".join(lines)


def card_text(lesson: dict, ex: dict) -> str:
    """Text of the cards the exercise draws on (else its objectives' cards), as approved."""
    ids = list(ex.get("cards") or [])
    if not ids:
        objectives = {o["id"]: o for o in lesson.get("objectives") or []}
        for oid in ex.get("objectives") or []:
            ids += objectives.get(oid, {}).get("cards", [])
    by_id = {c["id"]: c for c in lesson.get("cards") or []}
    return "\n\n".join(by_id[i]["text"] for i in dict.fromkeys(ids) if i in by_id and by_id[i].get("text")).strip()


def check_explanation(text: str, lang: str) -> list[str]:
    """KNW-10 R2 fixed checks."""
    fails = []
    if len(words(text)) > EXPLAIN_MAX_WORDS:
        fails.append("too_long")
    if quoted_spans(text):
        fails.append("quotation")
    if ATTRIBUTION.search(text):
        fails.append("attributed_saying")
    if lang != "ar" and has_arabic(text):
        fails.append("arabic_script")
    if TRANSLIT.search(text):
        fails.append("transliterated_dhikr")
    return fails


async def explain_mistake(session, body: ExplainIn, client: str = "-") -> str | None:
    lesson = (await published(session, "lesson", body.lang)).get(body.lesson_id)
    if not isinstance(lesson, dict):
        return None  # only approved text is ever explained
    if await session.get(ExplanationBlock, (body.exercise_id, body.lang)):
        return None  # the Sharia reviewer blocked explanations for this exercise
    ex = next((e for e in lesson.get("exercises") or [] if e.get("id") == body.exercise_id), None)
    if ex is None or not answer_belongs(ex, body.answer):
        return None  # card text only, as for any exercise that cannot be explained
    card = card_text(lesson, ex)
    if not card:
        return None
    try:
        # KNW-03 R3: approved terms in the learner's language (none yet: the input is unchanged).
        gloss = glossary.prompt_block(await glossary.prompt_terms(session, body.lang))
        await release(session)  # A-M1: no connection is held while the model works
        async with gate.slot(client):
            with call_budget(EXPLAIN_MAX_CALLS, EXPLAIN_SECONDS):
                text = await agents.explain_mistake(card, _render_exercise(ex), _render_answer(ex, body.answer), body.lang, gloss)
                if check_explanation(text, body.lang):
                    return None
                verdict = await agents.support_check("explain_checker", text, [card])
    except AiUnavailable:
        return None
    if not verdict["supported"]:
        return None
    await glossary.record_gaps(session, body.lang, [text, card])  # KNW-03 R5
    session.add(ExplanationLog(exercise_id=body.exercise_id, lang=body.lang, text=text))
    await session.commit()
    return text


@router.post("/explain")
async def explain(body: ExplainIn, session: Session, request: Request, user: OptionalUser) -> dict:
    clientkey.hit("explain", request, user, await limits.value("explain_per_minute"), 60)  # admin-editable (plt-admin-limits)
    clientkey.hit("explain:d", request, user, limits.get("explain_per_day"), 86400)
    return {"text": await explain_mistake(session, body, clientkey.primary(request, user))}


# --- guide (LRN-07, KNW-10 R3/R4) ---------------------------------------------

Id = Annotated[str, Field(max_length=24)]


class NextStep(BaseModel):
    lesson_id: str | None = Field(default=None, max_length=16)
    review: bool = False


class GuideIn(BaseModel):
    lang: Lang
    mastered: list[Id] = Field(default_factory=list, max_length=60)
    reviewing: list[Id] = Field(default_factory=list, max_length=60)
    next: NextStep | None = None
    returning: bool = False


async def approved_names(session, lang: str, learner: bool = False) -> tuple[dict[str, str], dict[str, str]]:
    """objective id → text (or, for messages to the learner, its short label:
    LRN-10 R1, LRN-07 R1) and lesson id → title, from live lessons only."""
    objectives: dict[str, str] = {}
    lessons: dict[str, str] = {}
    for lid, lesson in (await published(session, "lesson", lang)).items():
        if not isinstance(lesson, dict):
            continue
        lessons[lid] = lesson.get("title") or ""
        for o in lesson.get("objectives") or []:
            name = (o.get("label") if learner else None) or o.get("text")
            if name:
                objectives[o["id"]] = name
    return objectives, lessons


def check_guide(text: str, lang: str, allowed: set[str]) -> list[str]:
    fails = []
    sentences = [s for s in re.split(r"[.!?؟。]+\s*", text) if s.strip()]
    if len(sentences) > GUIDE_MAX_SENTENCES or len(text.split()) > GUIDE_MAX_WORDS:
        fails.append("too_long")
    if any(len(quoted_spans(sent)) > GUIDE_MAX_NAMES_PER_SENTENCE for sent in sentences):
        fails.append("too_many_names")
    if lang != "ar" and ("«" in text or "»" in text):
        fails.append("wrong_quote_marks")  # LRN-07 R1: each language uses its own quote marks
    for span in quoted_spans(text):
        if span.strip() not in allowed:
            fails.append("unknown_name")
            break
    outside = re.sub(r"«[^»]*»|“[^”]*”|\"[^\"]*\"", " ", text)
    if ATTRIBUTION.search(outside) or TRANSLIT.search(outside):
        fails.append("religious_content")
    if lang != "ar" and has_arabic(outside):
        fails.append("arabic_script")
    if _BLAME.search(outside):
        fails.append("blame")
    return fails


async def write_guide(session, body: GuideIn, client: str = "-") -> str | None:
    objectives, lessons = await approved_names(session, body.lang, learner=True)
    mastered = [objectives[i] for i in body.mastered if i in objectives]
    reviewing = [objectives[i] for i in body.reviewing if i in objectives]
    nxt: dict[str, str] | None = None
    if body.next and body.next.review:
        nxt = {"step": "review session"}
    elif body.next and body.next.lesson_id in lessons:
        nxt = {"step": "next lesson", "lesson": lessons[body.next.lesson_id]}
    if not (mastered or reviewing or nxt):
        return None
    summary = {"mastered": mastered, "needs_review": reviewing, "next": nxt, "returning": body.returning}
    allowed = {*mastered, *reviewing, *([nxt["lesson"]] if nxt and "lesson" in nxt else [])}
    try:
        await release(session)  # A-M1
        async with gate.slot(client):
            with call_budget(GUIDE_MAX_CALLS, GUIDE_SECONDS):
                text = await agents.write_guide(summary, body.lang)
                if check_guide(text, body.lang, allowed):
                    return None
                verdict = await agents.support_check("guide_checker", text, [json.dumps(summary, ensure_ascii=False)])
    except AiUnavailable:
        return None
    return text if verdict["supported"] else None


@router.post("/guide")
async def guide(body: GuideIn, session: Session, request: Request, user: OptionalUser) -> dict:
    clientkey.hit("guide", request, user, await limits.value("guide_per_minute"), 60)  # admin-editable (plt-admin-limits)
    clientkey.hit("guide:d", request, user, limits.get("guide_per_day"), 86400)
    return {"text": await write_guide(session, body, clientkey.primary(request, user))}  # the summary is not stored (KNW-10 R4)


# --- objective tagging (LRN-10 R5, KNW-10 R5) ---------------------------------

TAGGABLE_ROUTES = ("general", "disputed")  # never sensitive, danger, personal (KNW-10 R5)


async def tag_question(session, question: str, lang: str, route: str) -> str | None:
    if route not in TAGGABLE_ROUTES:
        return None
    objectives, _ = await approved_names(session, lang)
    if not objectives:
        return None
    try:
        await release(session)  # A-M1
        return await agents.tag_objective(question, objectives)
    except AiUnavailable:
        return None


# --- reviewer: explanation samples and blocks (LRN-03 R6) ---------------------
# The Sharia reviewer reads samples of shown explanations (stored with the
# exercise id and language only, no identity) and can block the explanation
# for one exercise in one language; explain_mistake then answers with the
# card text alone. Reviewer only: team members neither read nor block.

Reviewer = Annotated[User, Depends(require_role("sharia_reviewer"))]


def _pick(text: Any, lang: str) -> str:
    return (text.get(lang) or text.get("ar") or "") if isinstance(text, dict) else str(text or "")


def _exercise_info(exercise_id: str, lang: str) -> dict[str, str]:
    found = learning_content.store().exercise(exercise_id)
    if found is None:
        return {}
    lesson, ex = found
    return {"lesson_id": lesson["id"], "lesson_title": _pick(lesson.get("title"), lang), "prompt": _pick(ex.get("prompt"), lang)}


@router.get("/explanations")
async def explanation_samples(
    session: Session,
    _: Reviewer,
    lang: Lang | None = None,
    exercise_id: Annotated[str | None, Query(max_length=24)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    q = select(ExplanationLog).order_by(ExplanationLog.at.desc(), ExplanationLog.id).limit(limit)
    if lang:
        q = q.where(ExplanationLog.lang == lang)
    if exercise_id:
        q = q.where(ExplanationLog.exercise_id == exercise_id)
    rows = list(await session.scalars(q))
    blocks = list(await session.scalars(select(ExplanationBlock).order_by(ExplanationBlock.created_at.desc())))
    blocked = {(b.exercise_id, b.lang) for b in blocks}
    return {
        "items": [
            {
                "id": str(r.id),
                "at": r.at,
                "exercise_id": r.exercise_id,
                "lang": r.lang,
                "text": r.text,
                "blocked": (r.exercise_id, r.lang) in blocked,
                **_exercise_info(r.exercise_id, r.lang),
            }
            for r in rows
        ],
        "blocks": [
            {"exercise_id": b.exercise_id, "lang": b.lang, "at": b.created_at, **_exercise_info(b.exercise_id, b.lang)} for b in blocks
        ],
    }


@router.put("/explanations/blocks/{exercise_id}/{lang}")
async def block_explanation(exercise_id: str, lang: Lang, session: Session, user: Reviewer) -> dict:
    if learning_content.store().exercise(exercise_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "exercise_not_found")
    if await session.get(ExplanationBlock, (exercise_id, lang)) is None:
        session.add(ExplanationBlock(exercise_id=exercise_id, lang=lang, blocked_by=user.id))
        await session.commit()
    return {"blocked": True}


@router.delete("/explanations/blocks/{exercise_id}/{lang}")
async def unblock_explanation(exercise_id: str, lang: Lang, session: Session, _: Reviewer) -> dict:
    row = await session.get(ExplanationBlock, (exercise_id, lang))
    if row is not None:
        await session.delete(row)
        await session.commit()
    return {"blocked": False}
