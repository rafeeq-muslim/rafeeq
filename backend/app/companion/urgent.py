"""How often the urgent (danger) channel alerts people.

Security review 2026-10-07 (A-H4, B-M2): a danger case always reaches a human
(rules.md §2.8), so an urgent request is never refused because of how many
there are; what is limited is the *push* to every mentor and team member,
which a stranger could otherwise send to everyone again and again.

- One push to every responder per urgent request; while nobody holds it,
  further words in the same request alert at most once per
  `urgent_repeat_minutes` (default 10). Once someone holds it (B-M3) the
  holder hears every message and the team at most once per that interval.
- At most `urgent_pushes_per_hour` (default 20) such pushes per hour in total. Over the cap the request
  is still created and still shown first in every inbox; the mentors are not
  pushed, the team is (at most once per `TEAM_EVERY_S`), and it is logged.

Both numbers are admin-editable (app.core.limits, plt-admin-limits).
Counters live in memory (one backend process, like core/ratelimit)."""

import logging

from app.companion import notify
from app.core import limits, ratelimit

log = logging.getLogger(__name__)

TEAM_EVERY_S = 600
TEAM_ROLES = ["team", "admin"]


def _free(key: str, limit: int, window_s: int) -> bool:
    if ratelimit.full(key, limit, window_s):
        return False
    ratelimit.hit(key, limit, window_s)
    return True


def _queue_full() -> bool:
    """The notification queue is bounded (companion/notify.py) and drops what
    arrives when it is full. A push that would be dropped must not use up the
    request's turn, so the next message of the same request can still alert."""
    return len(notify._pending) >= notify.MAX_WAITING


def _every_s() -> int:
    return int(limits.get("urgent_repeat_minutes")) * 60


def alert_team(thread: object) -> bool:
    """A held urgent request (B-M3: its holder's and the team's): the team is
    told about new words in it at most once per `urgent_repeat_minutes`."""
    if _queue_full() or not _free(f"urgent-push-held:{thread}", 1, _every_s()):
        return False
    notify.later(notify.to_role, TEAM_ROLES, "urgent", "/inbox")
    return True


def alert(thread: object) -> str:
    """Alert people about the urgent request `thread` (its id), while nobody
    holds it. Returns what was done: all | team | none."""
    if _queue_full() or not _free(f"urgent-push-thread:{thread}", 1, _every_s()):
        return "none"
    if _free("urgent-push-all", int(limits.get("urgent_pushes_per_hour")), 3600):
        notify.later(notify.to_responders, "urgent", "/inbox")
        return "all"
    log.warning("urgent push cap reached: request kept, mentors not pushed")
    if _free("urgent-push-team", 1, TEAM_EVERY_S):
        notify.later(notify.to_role, TEAM_ROLES, "urgent", "/inbox")
        return "team"
    return "none"
