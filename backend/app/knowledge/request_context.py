"""KNW-01 reliability §14.1–14.2: one budget per question.

A `RequestContext` carries the question's random `ask_id`, a monotonic
deadline and the shared counters (external calls, retrieval rounds,
compose rounds). It is set in a context variable for the duration of one
`/api/ask` pipeline, so every model or embedding call, including a JSON
retry and the fallback model, draws from the same budget and receives
only the time that is left. Code outside the answer path (explainer,
guide, embedding job) runs without a context and keeps its own limits.

The trace holds stage names, durations, counts and known codes only:
never the question, the answer or passage text (PRD §7).
"""

import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

from app.knowledge.ai.errors import CallBudgetExhausted, DeadlineExceeded

MIN_CALL_SECONDS = 2.0  # below this a call cannot finish; stop instead of starting it


@dataclass
class RequestContext:
    ask_id: str
    deadline: float  # time.monotonic() value
    max_calls: int
    max_retrieval_rounds: int
    max_compose_rounds: int
    calls_used: int = 0
    retrieval_rounds_used: int = 0
    compose_rounds_used: int = 0
    # seconds kept free for later stages (e.g. the verifier while composing)
    reserve_seconds: float = 0.0
    stages: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def start(cls, ask_id: str, *, seconds: float, max_calls: int, max_retrieval_rounds: int, max_compose_rounds: int) -> "RequestContext":
        return cls(ask_id, time.monotonic() + seconds, max_calls, max_retrieval_rounds, max_compose_rounds)

    def remaining(self) -> float:
        return self.deadline - time.monotonic()

    def can_afford(self, calls: int, seconds: float) -> bool:
        """Room for `calls` more external calls and `seconds` more time."""
        return self.calls_used + calls <= self.max_calls and self.remaining() >= seconds

    def take_call(self, default_timeout: float) -> float:
        """Count one external call and return the timeout it may use.
        Raises before any request is sent if the budget or the time is gone."""
        if self.calls_used >= self.max_calls:
            raise CallBudgetExhausted("call_budget_exhausted")
        timeout = min(default_timeout, self.remaining() - self.reserve_seconds)
        if timeout < MIN_CALL_SECONDS:
            raise DeadlineExceeded("deadline_exceeded")
        self.calls_used += 1
        return timeout

    def stage(self, name: str, started: float, **info: Any) -> dict[str, Any]:
        row = {"stage": name, "ms": int((time.monotonic() - started) * 1000), **{k: v for k, v in info.items() if v is not None}}
        self.stages.append(row)
        return row


current: ContextVar[RequestContext | None] = ContextVar("knw_request_context", default=None)
