"""ORG-03 dashboard figures over linked learners only.

Every figure is a count of people. A count under 10 is never shown: it
becomes `{"n": None}` («أقل من 10»), and no percentage is built on it
(R2, MOT-08 R6). research/10 adds that no percentage may reveal a small
count either, so:

- a share is shown only when its count, its base and the rest (base minus
  count) are each 0 or at least 10 (the rest of «22 of 40» is 18);
- the status breakdown is one partition of the linked learners: if the
  hidden cells add up to 1-9 people, the next smallest cell is hidden too,
  until the hidden total is 0 or at least 10 (complementary suppression).

Statuses are MOT-07's: new, active, at_risk, lapsed, returning; "continuing"
= new, active or returning (R3). Nothing here leaves with a person in it:
the input is plain subjects, the output counts and shares only.
"""

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

MIN_PEOPLE = 10
RIYADH = ZoneInfo("Asia/Riyadh")
STATUSES = ("new", "active", "at_risk", "lapsed", "returning")
CONTINUING = {"new", "active", "returning"}
CHECKPOINTS = (30, 90)
RETURN_WINDOW = timedelta(days=30)
COHORT_MONTHS = 12
_NOT_LINKED = object()


@dataclass
class Subject:
    lang: str
    linked_at: datetime
    status: str | None
    history: list[tuple[datetime, str | None]] = field(default_factory=list)  # (at, status), oldest first

    def status_at(self, t: datetime):
        if t < self.linked_at:
            return _NOT_LINKED
        current = None
        for at, st in self.history:
            if at > t:
                break
            current = st
        return current


def _small(n: int) -> bool:
    return 0 < n < MIN_PEOPLE


def count(n: int) -> dict:
    """A count shown only from 10 people (0 is shown as «أقل من 10» too)."""
    return {"n": n if n >= MIN_PEOPLE else None}


def share(n: int, base: int) -> dict:
    """A count and its share of `base`, hidden when it could reveal fewer than 10 people."""
    if n < MIN_PEOPLE or base < MIN_PEOPLE or _small(base - n):
        return {"n": n if n >= MIN_PEOPLE and not _small(base - n) else None, "pct": None}
    return {"n": n, "pct": round(n / base, 4)}


def partition(cells: dict[str, int], total: int) -> dict[str, dict]:
    """R4: counts per status as one partition, with complementary suppression."""
    hidden = {k for k, v in cells.items() if v < MIN_PEOPLE}
    while _small(sum(cells[k] for k in hidden)) and len(hidden) < len(cells):
        hidden.add(min((k for k in cells if k not in hidden), key=lambda k: (cells[k], k)))
    out = {}
    for k, v in cells.items():
        if k in hidden or total < MIN_PEOPLE:
            out[k] = {"n": None, "pct": None}
        else:
            out[k] = {"n": v, "pct": round(v / total, 4)}
    return out


def month_of(t: datetime) -> str:
    return t.astimezone(RIYADH).strftime("%Y-%m")


def cohorts(subjects: list[Subject], now: datetime) -> list[dict]:
    """R3: per monthly cohort (linked in the same month, Asia/Riyadh), the
    share still continuing 30 and 90 days after each one linked. A checkpoint
    is due only once every member of the cohort has reached it, so a figure
    never moves while the cohort is still passing it («لم يحن بعد»)."""
    by_month: dict[str, list[Subject]] = defaultdict(list)
    for s in subjects:
        by_month[month_of(s.linked_at)].append(s)
    out = []
    for month in sorted(by_month, reverse=True)[:COHORT_MONTHS]:
        members = by_month[month]
        row: dict = {"month": month, "size": count(len(members))}
        for days in CHECKPOINTS:
            if any(s.linked_at + timedelta(days=days) > now for s in members):
                row[f"d{days}"] = {"due": False, "n": None, "pct": None}
                continue
            going = sum(1 for s in members if s.status_at(s.linked_at + timedelta(days=days)) in CONTINUING)
            row[f"d{days}"] = {"due": True, **share(going, len(members))}
        out.append(row)
    return out


def returned(subjects: list[Subject], now: datetime) -> dict:
    """R4, MOT-08 definition: of those lapsed at the start of the last 30
    days, the share who came back (status «returning») during them."""
    start = now - RETURN_WINDOW
    lapsed = [s for s in subjects if s.status_at(start) == "lapsed"]
    back = sum(1 for s in lapsed if any(st == "returning" and start < at <= now for at, st in s.history))
    return share(back, len(lapsed))


def language_groups(subjects: list[Subject]) -> tuple[list[dict], set[str]]:
    """R5: the only split. Languages under 10 people are pooled in «other»."""
    per = Counter(s.lang for s in subjects)
    shown = sorted((lang for lang, n in per.items() if n >= MIN_PEOPLE), key=lambda lang: (-per[lang], lang))
    small = {lang for lang in per if lang not in shown}
    rows = [{"lang": lang, **count(per[lang])} for lang in shown]
    other = sum(per[lang] for lang in small)
    if other:
        rows.append({"lang": "other", **count(other)})
    return rows, small


def dashboard(subjects: list[Subject], now: datetime, lang: str | None = None) -> dict:
    languages, small = language_groups(subjects)
    if lang == "other":
        subjects = [s for s in subjects if s.lang in small]
    elif lang:
        subjects = [s for s in subjects if s.lang == lang]
    total = len(subjects)
    cells = {k: 0 for k in (*STATUSES, "none")}
    for s in subjects:
        cells[s.status if s.status in STATUSES else "none"] += 1
    return {
        "as_of": now.isoformat(),
        "lang": lang,
        "empty": total == 0,
        "linked": count(total),
        "statuses": partition(cells, total),
        "returned": returned(subjects, now),
        "cohorts": cohorts(subjects, now),
        "languages": languages if lang is None else [],
    }
