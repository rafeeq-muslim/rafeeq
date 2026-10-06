"""Failures of the AI layer. Each one means no usable model output; none of
them is evidence that the sources lack an answer (KNW-01 reliability R4)."""


class AiUnavailable(Exception):
    """No model produced a usable answer (no key, outage, invalid output)."""


class BudgetExceeded(AiUnavailable):
    """The total or daily AI spend reached its ceiling; no paid call was made."""


class DeadlineExceeded(AiUnavailable):
    """The question's total time is used up; no call was started."""


class CallBudgetExhausted(AiUnavailable):
    """The question's shared external-call budget is used up; no call was started."""
