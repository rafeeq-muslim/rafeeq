"""Small in-memory sliding-window limiter (single backend instance).

Used for sign-in (rules.md §4: rate-limit sign-in), codes and AI calls."""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

_hits: dict[str, deque[float]] = defaultdict(deque)


def hit(key: str, limit: int, window_s: int) -> None:
    now = time.monotonic()
    q = _hits[key]
    while q and q[0] <= now - window_s:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited")
    q.append(now)


def reset() -> None:
    _hits.clear()
