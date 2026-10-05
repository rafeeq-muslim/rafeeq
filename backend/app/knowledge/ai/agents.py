"""The model-backed agents (docs/engineering/ai-agents.md). Each builds its
input from data only (question, passages, card text, summary), never from
identity, and returns parsed JSON or raises AiUnavailable/BudgetExceeded."""

import json
from typing import Any

from app.knowledge.ai import client
from app.knowledge.ai.client import prompt

ROUTES = ("general", "disputed", "personal", "sensitive", "danger", "manipulation", "out_of_scope")
LEVELS = ("A", "B", "C", "D")
LANG_NAME = {"ar": "Arabic (ar)", "en": "English (en)", "tl": "Tagalog/Filipino (tl)"}
PASSAGE_CHARS = 1400
CONTEXT_CHARS = 1400


def _q(text: str) -> str:
    """The user's text, fenced so it reads as data."""
    return "<<<\n" + text.replace("<<<", "«").replace(">>>", "»") + "\n>>>"


async def route_question(question: str, lang: str) -> dict[str, str]:
    def ok(d: dict) -> bool:
        return d.get("route") in ROUTES and d.get("level") in LEVELS

    r = await client.chat_json(
        "router", "fast", prompt("router"), f"LANGUAGE: {LANG_NAME[lang]}\nMESSAGE:\n{_q(question)}", max_tokens=40, check=ok
    )
    return {"route": r.data["route"], "level": r.data["level"]}


def passage_block(p: dict[str, Any]) -> str:
    head = [p["kind"], p.get("source_name") or p["source_id"]]
    meta = p.get("meta") or {}
    if meta.get("grade"):
        head.append(f"grade: {meta['grade']}")
    if meta.get("attribution"):
        head.append(str(meta["attribution"]))
    out = f"[{p['id']}] ({' · '.join(head)})\nTEXT: {p['quote_text'][:PASSAGE_CHARS]}"
    if p.get("context_text"):
        out += f"\nEXPLANATION: {p['context_text'][:CONTEXT_CHARS]}"
    return out


async def compose_answer(question: str, lang: str, route: str, level: str, passages: list[dict[str, Any]]) -> dict[str, Any]:
    def ok(d: dict) -> bool:
        return isinstance(d.get("sufficient"), bool) and isinstance(d.get("answer", ""), str) and isinstance(d.get("sources", []), list)

    user = f"LANGUAGE: {LANG_NAME[lang]}\nROUTE: {route} · LEVEL: {level}\nQUESTION:\n{_q(question)}\n\nPASSAGES:\n" + "\n---\n".join(
        passage_block(p) for p in passages
    )
    r = await client.chat_json("composer", "main", prompt("composer"), user, max_tokens=900, check=ok)
    d = r.data
    return {"sufficient": d["sufficient"], "answer": d.get("answer") or "", "sources": [str(s) for s in d.get("sources") or []]}


async def support_check(agent: str, text: str, sources: list[str]) -> dict[str, Any]:
    def ok(d: dict) -> bool:
        return isinstance(d.get("supported"), bool)

    user = "SOURCES:\n" + "\n---\n".join(s[:3000] for s in sources) + f"\n\nTEXT:\n{_q(text)}"
    r = await client.chat_json(agent, "fast", prompt("support_check"), user, max_tokens=300, check=ok)
    return {"supported": r.data["supported"], "unsupported": r.data.get("unsupported") or []}


async def explain_mistake(card: str, exercise: str, answer: str, lang: str) -> str:
    def ok(d: dict) -> bool:
        return isinstance(d.get("text"), str) and bool(d["text"].strip())

    user = f"LANGUAGE: {LANG_NAME[lang]}\nCARD:\n{_q(card)}\nEXERCISE:\n{_q(exercise)}\nANSWER:\n{_q(answer)}"
    r = await client.chat_json("explainer", "main", prompt("explainer"), user, max_tokens=250, check=ok)
    return r.data["text"].strip()


async def write_guide(summary: dict[str, Any], lang: str) -> str:
    def ok(d: dict) -> bool:
        return isinstance(d.get("text"), str) and bool(d["text"].strip())

    user = f"LANGUAGE: {LANG_NAME[lang]}\nRETURNING: {str(bool(summary.get('returning'))).lower()}\nLEARNING SUMMARY:\n" + json.dumps(
        {k: v for k, v in summary.items() if k != "returning"}, ensure_ascii=False, indent=1
    )
    r = await client.chat_json("guide", "fast", prompt("guide"), user, max_tokens=250, check=ok)
    return r.data["text"].strip()


async def tag_objective(question: str, objectives: dict[str, str]) -> str | None:
    def ok(d: dict) -> bool:
        return "objective_id" in d and (d["objective_id"] is None or isinstance(d["objective_id"], str))

    lines = "\n".join(f"{k}: {v}" for k, v in objectives.items())
    r = await client.chat_json(
        "tagger", "fast", prompt("tagger"), f"QUESTION:\n{_q(question)}\n\nOBJECTIVES:\n{lines}", max_tokens=40, check=ok
    )
    oid = r.data["objective_id"]
    return oid if oid in objectives else None
