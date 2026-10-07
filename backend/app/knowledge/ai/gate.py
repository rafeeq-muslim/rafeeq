"""One gate in front of every AI-backed request (security audit 2026-10-07, A-H3, A-M1).

`async with gate.slot(client):` wraps the model-backed part of /api/ask,
/api/learning/explain, /api/learning/guide and /api/home/order.

- A global cap on AI-backed requests per minute (`AI_GLOBAL_REQUESTS_PER_MINUTE`),
  whoever sends them: per-client limits alone multiply with addresses.
- At most `AI_MAX_CONCURRENT_REQUESTS` run at once (a request waits up to
  `AI_GATE_WAIT_SECONDS` for a place), and at most
  `AI_MAX_CONCURRENT_PER_CLIENT` of them for one client, so one client's slow
  questions cannot hold every place.

A refused entry raises `Busy`, an `AiUnavailable`: callers already turn that
into their fixed reply or fallback (the card text, the fixed guide message,
the fixed home order, the apology with «أريد إنسانًا»), never an HTTP error.
The danger, manipulation and learning-guide screens of /api/ask run before
the gate and cost no model call: a danger message always reaches a human.

In memory, for the single backend process (like app.core.ratelimit).
"""

import asyncio
import time
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.knowledge.ai.errors import AiUnavailable


class Busy(AiUnavailable):
    """The gate refused the request; no model call was started."""


_minute: deque[float] = deque()
_running = 0
_per_client: dict[str, int] = {}
_freed: asyncio.Event | None = None


def reset() -> None:
    global _running, _freed
    _minute.clear()
    _per_client.clear()
    _running = 0
    _freed = None


def running() -> int:
    return _running


def _take_minute() -> None:
    now = time.monotonic()
    while _minute and _minute[0] <= now - 60:
        _minute.popleft()
    if len(_minute) >= get_settings().ai_global_requests_per_minute:
        raise Busy("global_rate")
    _minute.append(now)


async def _take_place() -> None:
    """A place among the concurrent requests, waiting a little for one."""
    global _running, _freed
    st = get_settings()
    deadline = time.monotonic() + st.ai_gate_wait_seconds
    while _running >= st.ai_max_concurrent_requests:
        left = deadline - time.monotonic()
        if left <= 0:
            raise Busy("busy")
        if _freed is None:
            _freed = asyncio.Event()
        _freed.clear()
        try:
            async with asyncio.timeout(left):
                await _freed.wait()
        except TimeoutError:
            raise Busy("busy") from None
    _running += 1  # no await between the check above and this line


@asynccontextmanager
async def slot(client: str = "-") -> AsyncIterator[None]:
    """`client`: the caller's key (app.core.clientkey.primary)."""
    global _running
    if _per_client.get(client, 0) >= get_settings().ai_max_concurrent_per_client:
        raise Busy("client_busy")
    _take_minute()
    _per_client[client] = _per_client.get(client, 0) + 1
    try:
        await _take_place()
        try:
            yield
        finally:
            _running -= 1
            if _freed is not None:
                _freed.set()
    finally:
        _per_client[client] -= 1
        if _per_client[client] <= 0:
            del _per_client[client]
