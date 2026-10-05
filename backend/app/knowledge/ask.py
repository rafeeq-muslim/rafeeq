"""KNW-01: the sourced answer. POST /api/ask (guests allowed).

Pipeline (plan §1, docs/engineering/implementation/KNW-01.md):
  danger phrases (no model) → manipulation phrases → "what should I learn
  now?" → router (route + level) → retrieval in the asker's language →
  composer (passages only) → verifier (code + support check) → response
  whose Quran/hadith text comes from the stored records by id.

Not streamed: the verifier must pass the whole answer before anything is
shown (rules.md §2.3). Nothing here stores the question text (plan 4.9);
the provider receives the question and passages only (rules.md §2.6).
"""

import logging
import time
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.deps import OptionalUser, Session
from app.core.events import publish
from app.knowledge import tasks
from app.knowledge.ai import agents, screen
from app.knowledge.ai.client import AiUnavailable
from app.knowledge.ai.textcheck import MARKER, words
from app.knowledge.models import AnswerLog, Passage, Source
from app.knowledge.search import search
from app.knowledge.verify import cited_ids, verify

log = logging.getLogger("rafeeq.ask")
router = APIRouter(prefix="/api", tags=["ask"])
Lang = Literal["ar", "en", "tl"]
ESCALATE_ROUTES = ("personal", "sensitive")


class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    lang: Lang
    consent_objectives: bool = False  # KNW-10 R5: the device flag `askConsent`, off by default


def _base(ask_id: str, lang: str) -> dict[str, Any]:
    return {
        "ask_id": ask_id,
        "outcome": "",
        "route": None,
        "level": None,
        "answer": "",
        "sources": [],
        "notes": [],
        "should_escalate": False,
        "handoff": None,
        "objective_id": None,
        "lang": lang,
    }


class Result:
    """The response plus the events to publish (kept apart so the KNW-04
    runner can inspect them without writing)."""

    def __init__(self, body: dict[str, Any], events: list[tuple[str, dict]] | None = None, checks: list[str] | None = None):
        self.body = body
        self.events = events or []
        self.checks = checks or []


def _fixed(r: dict[str, Any], outcome: str, reply: str, route: str | None = None) -> dict[str, Any]:
    r.update(outcome=outcome, answer=screen.fixed(reply, r["lang"]))
    if route:
        r["route"] = route
    return r


def _danger(r: dict[str, Any], detector: str) -> Result:
    _fixed(r, "danger", "danger", "danger")
    r.update(should_escalate=True, handoff={"kind": "urgent", "lang": r["lang"]})
    # rules.md §2.9 / KNW-01 R5: the event never carries the question text or identity.
    return Result(r, [("DangerDetected", {"ask_id": r["ask_id"], "lang": r["lang"], "detector": detector})])


def _no_source(r: dict[str, Any], reason: str, checks: list[str] | None = None) -> Result:
    _fixed(r, "no_source" if reason != "unavailable" else "unavailable", "no_source" if reason != "unavailable" else "unavailable")
    r.update(should_escalate=True, handoff={"kind": "escalation", "lang": r["lang"]}, sources=[], notes=[])
    event = {"ask_id": r["ask_id"], "lang": r["lang"], "route": r["route"], "reason": reason}
    return Result(r, [("EscalationRequested", event)], checks)


async def source_cards(session: AsyncSession, ids: list[str]) -> list[dict[str, Any]]:
    """Source cards for the cited ids, with Quran/hadith text from the
    database (rules.md §1.3): the passage's own text plus the Arabic ayah or
    Arabic hadith of the same record."""
    if not ids:
        return []
    rows = {p.id: p for p in await session.scalars(select(Passage).where(Passage.id.in_(ids)))}
    names = {s.id: s.name for s in await session.scalars(select(Source))}
    ayah_keys = {p.ref_key for p in rows.values() if p.source_id == "quranenc" and p.kind != "quran_arabic"}
    arabic = {}
    if ayah_keys:
        arabic = {
            p.ref_key: p.quote_text
            for p in await session.scalars(
                select(Passage).where(Passage.source_id == "quranenc", Passage.kind == "quran_arabic", Passage.ref_key.in_(ayah_keys))
            )
        }
    cards = []
    for i in ids:
        p = rows.get(i)
        if p is None:
            continue
        meta = p.meta or {}
        card = {
            "id": p.id,
            "source_id": p.source_id,
            "source_name": names.get(p.source_id, p.source_id),
            "kind": p.kind,
            "lang": p.lang,
            "ref": p.ref,
            "ref_key": p.ref_key,
            "quote_text": p.quote_text,
            "arabic_text": None,
            "translation": meta.get("translation_key"),
            "grade": meta.get("grade"),
            "attribution": meta.get("attribution"),
            "title": meta.get("title") or meta.get("book_title") or (p.ref or {}).get("title"),
            "origin_url": p.origin_url,
            "version": p.version,
        }
        if p.source_id == "quranenc" and p.kind != "quran_arabic":
            card["arabic_text"] = arabic.get(p.ref_key)
        elif p.kind == "hadith" and p.lang != "ar":
            card["arabic_text"] = meta.get("hadeeth_ar")
        cards.append(card)
    return cards


def _similar(a: str, b: str) -> float:
    x, y = set(words(a)), set(words(b))
    return len(x & y) / len(x | y) if x and y else 0.0


async def _cached_answer(session: AsyncSession, r: dict[str, Any], question: str) -> Result | None:
    """Plan 4.8: an approved saved answer for a frequent question, matched without any model."""
    best, score = None, 0.0
    for a in screen.approved_answers():
        if a.get("lang") != r["lang"]:
            continue
        s = max((_similar(question, q) for q in a.get("questions", [])), default=0.0)
        if s > score:
            best, score = a, s
    if best is None or score < 0.75:
        return None
    ids = list(dict.fromkeys([*MARKER.findall(best["answer"]), *best.get("sources", [])]))
    cards = await source_cards(session, ids)
    if len(cards) != len(ids) or not cards:
        return None  # a source is missing: never show it half-sourced
    r.update(outcome="cached", answer=best["answer"], sources=cards, route=r["route"] or "general")
    return Result(r)


async def _unavailable(session: AsyncSession, r: dict[str, Any], question: str) -> Result:
    cached = await _cached_answer(session, r, question)
    return cached or _no_source(r, "unavailable")


async def answer(session: AsyncSession, question: str, lang: str, consent_objectives: bool = False) -> Result:
    question = question.strip()
    r = _base(uuid.uuid4().hex, lang)

    # 1. Danger: phrases first, no model, no network (plan 2.6, 4.2).
    if screen.is_danger(question):
        return _danger(r, "phrase")
    # 2. Attempts to bypass the rules (R6).
    if screen.is_manipulation(question):
        return Result(_fixed(r, "refused", "manipulation", "manipulation"))
    # 3. "What should I learn now?" goes to the learning guide (KNW-10 R3).
    if screen.is_learning_guide(question):
        return Result(_fixed(r, "learning_guide", "learning_guide"))

    # 4. Route and level.
    try:
        routed = await agents.route_question(question, lang)
    except AiUnavailable:
        return await _unavailable(session, r, question)
    r.update(route=routed["route"], level=routed["level"])
    if r["route"] == "danger":
        return _danger(r, "router")
    if r["route"] == "manipulation":
        return Result(_fixed(r, "refused", "manipulation"))
    if r["route"] == "out_of_scope":
        return Result(_fixed(r, "out_of_scope", "out_of_scope"))

    # 5. Retrieve in the asker's language only.
    passages = await search(session, question, lang)
    if not passages:
        return _no_source(r, "no_source")
    retrieved = {p["id"]: p for p in passages}

    # 6. Compose from the passages only, then verify before showing.
    try:
        out = await agents.compose_answer(question, lang, r["route"], r["level"], passages)
    except AiUnavailable:
        return await _unavailable(session, r, question)
    fails = await verify(out, lang, retrieved)
    if fails:
        log.info("answer dropped: %s", ",".join(fails))
        return _no_source(r, "no_source", fails)

    r.update(outcome="answered", answer=out["answer"], sources=await source_cards(session, cited_ids(out)))
    events: list[tuple[str, dict]] = []
    # Code, not the model, adds the referral and the "views differ" note (plan 4.6).
    if r["route"] == "personal":
        r["notes"].append(screen.fixed("personal_note", lang))
    if r["route"] == "disputed":
        r["notes"].append(screen.fixed("disputed_note", lang))
    if r["route"] in ESCALATE_ROUTES:
        r.update(should_escalate=True, handoff={"kind": "escalation", "lang": lang})
        events.append(("EscalationRequested", {"ask_id": r["ask_id"], "lang": lang, "route": r["route"], "reason": r["route"]}))

    # 7. KNW-10 R5: objective tagging with consent only, never for sensitive routes.
    if consent_objectives:
        oid = await tasks.tag_question(session, question, lang, r["route"])
        if oid:
            r["objective_id"] = oid
            events.append(("ObjectiveAsked", {"objective_id": oid}))
    return Result(r, events, [])


@router.post("/ask")
async def ask(body: AskIn, session: Session, request: Request, user: OptionalUser) -> dict:
    key = tasks.client_key(request, user)
    ratelimit.hit(f"ask:m:{key}", 8, 60)
    ratelimit.hit(f"ask:d:{key}", 120, 86400)
    started = time.monotonic()
    result = await answer(session, body.question, body.lang, body.consent_objectives)
    b = result.body
    for name, payload in result.events:
        await publish(session, name, "KNW", payload)
    session.add(
        AnswerLog(
            lang=b["lang"],
            route=b["route"] or "none",
            level=b["level"],
            outcome=b["outcome"],
            latency_ms=int((time.monotonic() - started) * 1000),
        )
    )
    await session.commit()
    return b
