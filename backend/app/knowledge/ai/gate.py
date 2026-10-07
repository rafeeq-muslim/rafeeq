"""One gate in front of every AI-backed request (security audit 2026-10-07, A-H3).

`async with gate.slot(client):` wraps the model-backed part of /api/ask,
/api/learning/explain, /api/learning/guide and /api/home/order.

- A global cap on AI-backed requests per minute (`AI_GLOBAL_REQUESTS_PER_MINUTE`),
  whoever sends them: per-client limits alone multiply with addresses.

A refused entry raises `Busy`, an `AiUnavailable`: callers already turn that
into their fixed reply or fallback (the card text, the fixed guide message,
the fixed home order, the apology with «أريد إنسانًا»), never an HTTP error.
The danger, manipulation and learning-guide screens of /api/ask run before
the gate and cost no model call: a danger message always reaches a human.

In memory, for the single backend process (like app.core.ratelimit).
"""

import time
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.knowledge.ai.errors import AiUnavailable


class Busy(AiUnavailable):
    """The gate refused the request; no model call was started."""


_minute: deque[float] = deque()


def reset() -> None:
    _minute.clear()


def _take_minute() -> None:
    now = time.monotonic()
    while _minute and _minute[0] <= now - 60:
        _minute.popleft()
    if len(_minute) >= get_settings().ai_global_requests_per_minute:
        raise Busy("global_rate")
    _minute.append(now)


@asynccontextmanager
async def slot(client: str = "-") -> AsyncIterator[None]:
    """`client`: the caller's key (app.core.clientkey.primary)."""
    _take_minute()
    yield
