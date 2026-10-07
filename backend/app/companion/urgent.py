"""How often the urgent (danger) channel alerts people.

Security review 2026-10-07 (A-H4, B-M2): a danger case always reaches a human
(rules.md §2.8), so an urgent request is never refused because of how many
there are; what is limited is the *push* to every mentor and team member,
which a stranger could otherwise send to everyone again and again.

- One push to every responder per urgent request; while nobody has answered,
  further words in the same request alert at most once per `THREAD_EVERY_S`.
- At most `PUSH_CAP` such pushes per hour in total. Over the cap the request
  is still created and still shown first in every inbox; the mentors are not
  pushed, the team is (at most once per `TEAM_EVERY_S`), and it is logged.

Counters live in memory (one backend process, like core/ratelimit)."""

import logging

from fastapi import HTTPException

from app.companion import notify
from app.core import ratelimit

log = logging.getLogger(__name__)

THREAD_EVERY_S = 600
PUSH_CAP = 20  # pushes to every responder per hour
TEAM_EVERY_S = 600
TEAM_ROLES = ["team", "admin"]


def _free(key: str, limit: int, window_s: int) -> bool:
    try:
        ratelimit.hit(key, limit, window_s)
    except HTTPException:
        return False
    return True


def alert(thread: object) -> str:
    """Alert people about the urgent request `thread` (its id).
    Returns what was done: all | team | none."""
    if not _free(f"urgent-push-thread:{thread}", 1, THREAD_EVERY_S):
        return "none"
    if _free("urgent-push-all", PUSH_CAP, 3600):
        notify.later(notify.to_responders, "urgent", "/inbox")
        return "all"
    log.warning("urgent push cap reached: request kept, mentors not pushed")
    if _free("urgent-push-team", 1, TEAM_EVERY_S):
        notify.later(notify.to_role, TEAM_ROLES, "urgent", "/inbox")
        return "team"
    return "none"
