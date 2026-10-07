"""Small in-memory sliding-window limiter (single backend instance).

Used for sign-in (rules.md §4: rate-limit sign-in), codes and AI calls.

Memory is bounded (security audit A-H2 / C-L2):
- a key is stored as a 16-byte digest, whatever the caller passes;
- a key whose hits have all left its window is removed when it is next read,
  and a sweep every SWEEP_SECONDS removes the ones nobody reads again;
- at most MAX_KEYS keys are kept; past that, the key used longest ago goes first.
"""

import hashlib
import time
from collections import deque

from fastapi import HTTPException, status

MAX_KEYS = 50_000
SWEEP_SECONDS = 60.0

# digest -> (window in seconds, hit times). Insertion order = least recently used first.
_hits: dict[bytes, tuple[int, deque[float]]] = {}
_swept_at = 0.0


def _digest(key: str) -> bytes:
    return hashlib.blake2b(key.encode("utf-8", "surrogatepass"), digest_size=16).digest()


def _live(k: bytes, now: float, window_s: int) -> deque[float] | None:
    """The key's hits still inside the window; the key is dropped when none are."""
    entry = _hits.get(k)
    if entry is None:
        return None
    q = entry[1]
    while q and q[0] <= now - window_s:
        q.popleft()
    if not q:
        del _hits[k]
        return None
    return q


def _sweep(now: float) -> None:
    global _swept_at
    if now - _swept_at < SWEEP_SECONDS:
        return
    _swept_at = now
    for k in [k for k, (window_s, q) in _hits.items() if not q or q[-1] <= now - window_s]:
        del _hits[k]


def full(key: str, limit: int, window_s: int) -> bool:
    """Whether `key` already holds `limit` hits in the window. Records nothing."""
    q = _live(_digest(key), time.monotonic(), window_s)
    return q is not None and len(q) >= limit


def hit(key: str, limit: int, window_s: int) -> None:
    now = time.monotonic()
    _sweep(now)
    k = _digest(key)
    q = _live(k, now, window_s)
    if q is not None and len(q) >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited")
    if q is None:
        q = deque()
    else:
        del _hits[k]  # re-inserted below as the most recently used
    while len(_hits) >= MAX_KEYS:
        del _hits[next(iter(_hits))]
    _hits[k] = (window_s, q)
    q.append(now)


def reset() -> None:
    global _swept_at
    _hits.clear()
    _swept_at = 0.0
