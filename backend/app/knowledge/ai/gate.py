"""One gate in front of every AI-backed request: per client only.

`async with gate.slot(client):` wraps the model-backed part of /api/ask,
/api/learning/explain, /api/learning/guide and /api/home/order.

Owner decision 2026-10-10 (plt-admin-limits): "We used OpenRouter to have an
unlimited amount of concurrent users of the AI assistant." The global cap of
120 requests a minute and the global ceiling of 12 requests at once (security
audit 2026-10-07, A-H3 / A-M1) are removed: one person's question never waits
for, or is degraded by, other people's questions. What stays is per client:
at most `ai_concurrent_per_client` (admin-editable, app.core.limits) of
one client's requests run at once, so a single client cannot open hundreds of
model calls. Per-minute and per-day allowances per address and per account
are counted by the routes (app.core.clientkey). Money is bounded by the
budget ceilings in app.knowledge.ai.client, not here.

A refused entry raises `Busy`, an `AiUnavailable`: callers turn that into
their retryable reply or fallback, never an HTTP error and never a wait.
The danger, manipulation and learning-guide screens of /api/ask run before
the gate and cost no model call: a danger message always reaches a human.

In memory, for the single backend process (like app.core.ratelimit).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.core import limits
from app.knowledge.ai.errors import AiUnavailable


class Busy(AiUnavailable):
    """The gate refused the request; no model call was started."""


_running = 0
_per_client: dict[str, int] = {}


def reset() -> None:
    global _running
    _per_client.clear()
    _running = 0


def running() -> int:
    """AI-backed requests running now (observability only: never a cap)."""
    return _running


@asynccontextmanager
async def slot(client: str = "-") -> AsyncIterator[None]:
    """`client`: the caller's key (app.core.clientkey.primary)."""
    global _running
    cap = await limits.value("ai_concurrent_per_client")
    if _per_client.get(client, 0) >= cap:
        raise Busy("client_busy")
    _per_client[client] = _per_client.get(client, 0) + 1  # no await between the check and this line
    _running += 1
    try:
        yield
    finally:
        _running -= 1
        _per_client[client] -= 1
        if _per_client[client] <= 0:
            del _per_client[client]
