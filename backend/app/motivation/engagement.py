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
"""

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
