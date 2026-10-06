"""KNW-01 reliability R7 / plan 4.8: approved answers for frequent general
questions (`content/knowledge/approved-answers.json`), served with outcome
`cached` only when `ASK_APPROVED_FAQ_ENABLED` is on.

An entry is served only if every condition holds (PRD §14.1 rule 9):
- status "approved" with a reviewer and an approval date (written by the
  Sharia reviewer; nothing generated is ever marked approved);
- same language as the question;
- every cited passage still exists, has the recorded version and belongs to
  a source the answer policy allows now (KNW-02 SC1, S09);
- the question matches one of its phrasings: exactly (after normalization)
  always; approximately (word overlap ≥ 0.75) only when the router said
  `general` with level A or B, with the same negation words, no personal
  detail, and at most two extra words. When the router is unavailable,
  only an exact match is used.
The suggestion id never selects an entry: only the question text does.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge import source_policy
from app.knowledge.ai import screen
from app.knowledge.ai.textcheck import MARKER, normalize, words
from app.knowledge.models import Passage

FUZZY_MIN = 0.75
NEGATION = {
    "لا",
    "لم",
    "لن",
    "ليس",
    "ليست",
    "غير",
    "بدون",
    "not",
    "no",
    "never",
    "don't",
    "doesn't",
    "isn't",
    "can't",
    "cannot",
    "without",
    "hindi",
    "wala",
    "huwag",
}
PERSONAL = {
    "انا",
    "لي",
    "عندي",
    "زوجي",
    "زوجتي",
    "امي",
    "ابي",
    "اهلي",
    "حالتي",
    "i",
    "i'm",
    "my",
    "me",
    "mine",
    "ako",
    "ko",
    "akin",
    "aking",
}


def _jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def matches(question: str, phrasing: str, *, exact_only: bool) -> bool:
    if normalize(question) == normalize(phrasing):
        return True
    if exact_only:
        return False
    qw, pw = words(question), words(phrasing)
    if NEGATION & set(qw) != NEGATION & set(pw):
        return False  # «لا» or "not" added or removed changes the meaning
    if PERSONAL & (set(qw) - set(pw)):
        return False  # a personal detail turns a general question into a personal case
    if len(qw) > len(pw) + 2:
        return False
    return _jaccard(set(qw), set(pw)) >= FUZZY_MIN


def entry_ids(entry: dict[str, Any]) -> list[str]:
    return list(dict.fromkeys([*MARKER.findall(entry.get("answer") or ""), *entry.get("sources", [])]))


async def valid_sources(session: AsyncSession, entry: dict[str, Any]) -> bool:
    """Every cited passage exists, with the version the reviewer approved,
    from a source the answer policy allows now."""
    ids = entry_ids(entry)
    versions = entry.get("source_versions") or {}
    if not ids or any(i not in versions for i in ids):
        return False
    rows = {p.id: p for p in await session.scalars(select(Passage).where(Passage.id.in_(ids)))}
    allowed = set((await source_policy.eligible_sources(session)).sources)
    return all(i in rows and rows[i].version == versions[i] and rows[i].source_id in allowed for i in ids)


def _approved(entry: dict[str, Any]) -> bool:
    return entry.get("status") == "approved" and bool(entry.get("reviewer")) and bool(entry.get("approved_at"))


async def find(
    session: AsyncSession, question: str, lang: str, *, route: str | None, level: str | None, exact_only: bool
) -> dict[str, Any] | None:
    if not exact_only and not (route == "general" and level in ("A", "B")):
        return None
    for entry in screen.approved_answers():
        if entry.get("lang") != lang or not _approved(entry):
            continue
        if not any(matches(question, p, exact_only=exact_only) for p in entry.get("questions", [])):
            continue
        if await valid_sources(session, entry):
            return entry
    return None
