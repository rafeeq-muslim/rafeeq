"""MOT-07 engagement status, from learning interactions only (R1).

Days are whole 24-hour periods since the last learning interaction
(a completed lesson, repeats included, or a completed review session).
Checked in this order (R2):
  returning  completed a lesson after being lapsed, < 7 days ago
  new        < 7 days since the first completed lesson
  active     last interaction 0-7 days ago
  at_risk    8-29 days
  lapsed     30+ days
No interaction yet: no status.

An account (R6: what the mentor sees) has ONE status across its devices that
have not opted out: the most recent learning interaction on any of them
wins, and the account is «new» only for 7 days from its earliest one, so a
second device never makes it new again (`account_timeline`).
"""

from collections.abc import Iterable
from datetime import datetime, timedelta

DAY = timedelta(days=1)
STATUSES = ("returning", "new", "active", "at_risk", "lapsed")


def whole_days(since: datetime, now: datetime) -> int:
    return int((now - since) / DAY)


def status_at(now: datetime, first_at: datetime | None, last_at: datetime | None, returned_at: datetime | None) -> str | None:
    if first_at is None or last_at is None:
        return None
    if returned_at is not None and whole_days(returned_at, now) < 7:
        return "returning"
    if whole_days(first_at, now) < 7:
        return "new"
    gap = whole_days(last_at, now)
    if gap <= 7:
        return "active"
    if gap < 30:
        return "at_risk"
    return "lapsed"


def after_interaction(
    at: datetime, first_at: datetime | None, last_at: datetime | None, returned_at: datetime | None
) -> tuple[datetime, datetime, datetime | None]:
    """New (first_at, last_at, returned_at) after a learning interaction at `at`.

    Out-of-order events (sent late from an offline queue) never move
    `last_at` backwards."""
    if first_at is None or last_at is None:
        return at, at, None
    if at <= last_at:
        return min(first_at, at), last_at, returned_at
    if whole_days(last_at, at) >= 30:  # was lapsed: this lesson is a return
        returned_at = at
    return first_at, at, returned_at


Timeline = tuple[datetime | None, datetime | None, datetime | None]  # first_at, last_at, returned_at


def account_timeline(devices: Iterable[Timeline]) -> Timeline:
    """One (first_at, last_at, returned_at) for an account from its devices'.

    first_at is the earliest, last_at the latest. A return counts for the
    account only if the whole account was lapsed before it: the candidate is a
    device's own return, or the first lesson on a device added later, and no
    other device may have been in use during the 30 days before it (a
    device's [first_at, last_at] span counts as in use, so the account is
    never wrongly shown as «returning»). The latest such return wins."""
    rows = [(f, la, r) for f, la, r in devices if f is not None and la is not None]
    if not rows:
        return None, None, None
    first = min(f for f, _, _ in rows)
    last = max(la for _, la, _ in rows)
    returned = None
    for i, (f, _, r) in enumerate(rows):
        for cand in (r, f if f > first else None):
            if cand is None or (returned is not None and cand <= returned):
                continue
            others = (o for j, o in enumerate(rows) if j != i)
            if all(not (of < cand and whole_days(ol, cand) < 30) for of, ol, _ in others):  # type: ignore[operator]
                returned = cand
    return first, last, returned


def account_status(now: datetime, devices: Iterable[Timeline]) -> str | None:
    return status_at(now, *account_timeline(devices))
