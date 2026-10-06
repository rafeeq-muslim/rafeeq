"""PRD live v3 §6: one contract for every connector.

A `Candidate` is what a search returned (an id, a title, maybe a snippet):
never evidence by itself. `Evidence` is text fetched from the source's own
record page or API in this attempt, with its identity and provenance. A
`SourceResult` is one connector's honest outcome for this attempt.

Nothing here holds the question text or any identity (A26)."""

from dataclasses import dataclass, field
from typing import Any, Literal

Status = Literal["ok", "no_results", "unavailable", "unsupported_language", "cancelled"]

# Reason codes (diagnostics; never shown to the user as text).
NOT_ENABLED = "not_enabled"
NOT_CONNECTED = "not_connected"  # the connector is not usable from the backend (A13)
UNSUPPORTED_LANGUAGE = "unsupported_language"
TIMEOUT = "timeout"
RATE_LIMITED = "rate_limited"
HTTP_ERROR = "http_error"
TRANSPORT_ERROR = "transport_error"
BAD_RESPONSE = "bad_response"
BLOCKED_URL = "blocked_url"
FETCH_FAILED = "fetch_failed"
NO_RESULTS = "no_results"
WINDOW_CLOSED = "window_closed"
BUDGET_EXHAUSTED = "budget_exhausted"
INTERNAL_ERROR = "internal_error"


@dataclass
class Candidate:
    """A search hit: a pointer to a record, not proof of anything (§6)."""

    source_id: str
    external_id: str  # the record id at the source (digits only for our connectors)
    lang: str
    title: str
    rank: int  # 1-based position in the source's own result list
    snippet: str = ""
    meta: dict[str, Any] = field(default_factory=dict)  # connector-specific routing (e.g. encyclopedia id)


@dataclass
class Evidence:
    """Text fetched from the source in this attempt (§6). `source_text` is the
    source's own words (HTML removed only); the model never authors it."""

    evidence_id: str  # live:<source_id>:<lang>:<external_id>:c<N>
    source_id: str
    provider_id: str  # the host the text was read from
    external_record_id: str
    canonical_url: str
    title: str
    lang: str
    source_text: str
    content_hash: str
    retrieved_at: str  # ISO 8601 UTC, when this backend read it
    request_id: str  # the ask_id of the attempt
    kind: str = "fatwa"
    context_text: str = ""  # the record's title and question (helps the composer; not cited text)
    attribution: str | None = None  # who said it, when the page says so (never confused with the site)
    rank_score: float = 0.0
    provenance: list[dict[str, Any]] = field(default_factory=list)

    def passage(self, source_name: str) -> dict[str, Any]:
        """The passage shape the composer and verifier already use (search.passage_dict)."""
        return {
            "id": self.evidence_id,
            "source_id": self.source_id,
            "source_name": source_name,
            "kind": self.kind,
            "lang": self.lang,
            "ref": {"title": self.title, "external_id": self.external_record_id},
            "ref_key": self.external_record_id,
            "quote_text": self.source_text,
            "context_text": self.context_text,
            "meta": {"title": self.title, "attribution": self.attribution, "retrieved_at": self.retrieved_at, "live": True},
            "version": f"live:{self.retrieved_at}",
            "origin_url": self.canonical_url,
            "score": self.rank_score,
        }


@dataclass
class SourceResult:
    """One connector's outcome for one attempt (§6, §10). Counts and codes only."""

    source_id: str
    attempted: bool
    status: Status
    reason_code: str | None = None
    request_id: str = ""
    candidates: list[Candidate] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)
    duration_ms: int = 0
    calls: int = 0

    def public(self) -> dict[str, Any]:
        """The optional `live_search` entry of the API (§10): no reason text, no URLs."""
        return {"source_id": self.source_id, "attempted": self.attempted, "status": self.status}

    def trace(self) -> dict[str, Any]:
        """For knw_answer_log: codes, counts and durations only (A26)."""
        return {
            "attempted": self.attempted,
            "status": self.status,
            "reason": self.reason_code,
            "candidates": len(self.candidates),
            "evidence": len(self.evidence),
            "calls": self.calls,
            "ms": self.duration_ms,
        }
