"""Knowledge & Ask (KNW): sources, passages (pgvector), AI usage and logs
without identity, library, saved items, glossary, daily cards, the
reliability test (KNW-04)."""

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Computed, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin

EMBED_DIM = 1024  # baai/bge-m3

# KNW-01 hybrid retrieval: full-text vector per passage. English is stemmed;
# Arabic loses diacritics and tatweel and folds alef/ya/ta marbuta, the same
# way app.knowledge.ai.textcheck.normalize treats the question.
TSV_SQL = (
    "to_tsvector(CASE WHEN lang = 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END, "
    "translate(regexp_replace(left(quote_text || ' ' || coalesce(context_text, ''), 20000), "
    "'[\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640]', '', 'g'), "
    "'أإآٱىةؤئ', 'اااايهوي'))"
)


class Source(Base):
    """KNW-02 R1: only `index` sources are stored and indexed."""

    __tablename__ = "knw_sources"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    mode: Mapped[str] = mapped_column(String(8))  # index | link
    license: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(String(300))
    versions: Mapped[dict] = mapped_column(JSONB, default=dict)  # key -> {version, fetched_at, count}


class Passage(Base):
    """KNW plan §3.4: text exactly as the source served it."""

    __tablename__ = "knw_passages"
    __table_args__ = (
        Index("ix_knw_passages_lang_kind", "lang", "kind"),
        Index("ix_knw_passages_embedding", "embedding", postgresql_using="hnsw", postgresql_ops={"embedding": "vector_cosine_ops"}),
        Index("ix_knw_passages_tsv", "tsv", postgresql_using="gin"),
    )
    id: Mapped[str] = mapped_column(String(96), primary_key=True)
    source_id: Mapped[str] = mapped_column(String(32), ForeignKey("knw_sources.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24))  # quran_arabic | quran_translation | quran_tafsir | hadith | approved_card
    lang: Mapped[str] = mapped_column(String(5))
    ref: Mapped[dict] = mapped_column(JSONB)
    ref_key: Mapped[str] = mapped_column(String(64), index=True)  # "2:255" | hadith id
    quote_text: Mapped[str] = mapped_column(Text)
    context_text: Mapped[str] = mapped_column(Text, default="")
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    version: Mapped[str] = mapped_column(String(32))
    origin_url: Mapped[str] = mapped_column(String(400))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    text_hash: Mapped[str] = mapped_column(String(80))
    embedding = mapped_column(Vector(EMBED_DIM), nullable=True)
    tsv = mapped_column(TSVECTOR, Computed(TSV_SQL, persisted=True), nullable=True)


class AiCall(IdMixin, Base):
    """Cost and outcome of every model call. Never the prompt or identity."""

    __tablename__ = "knw_ai_calls"
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    agent: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(80))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    # KNW-01 reliability §7: the random id of the /api/ask request the call
    # served (NULL for the embedding job, learning tasks and older rows).
    ask_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)


class AnswerLog(IdMixin, Base):
    """KNW plan 4.9: route, outcome and time only; no question text.
    KNW-01 reliability §7 adds the random `ask_id`, the public reason, the
    internal detail code, the entry point and a stage trace of names,
    durations, counts and known codes (never question, answer or passage
    text). All added columns are nullable: older rows stay valid."""

    __tablename__ = "knw_answer_log"
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    lang: Mapped[str] = mapped_column(String(5))
    route: Mapped[str] = mapped_column(String(16))
    level: Mapped[str | None] = mapped_column(String(1), nullable=True)
    # answered | cached | no_source | verification_failed | unavailable | danger | refused | out_of_scope | learning_guide | error
    outcome: Mapped[str] = mapped_column(String(24))
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    ask_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    reason_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    detail: Mapped[str | None] = mapped_column(String(48), nullable=True)
    entrypoint: Mapped[str | None] = mapped_column(String(12), nullable=True)
    suggestion_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    client_request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    trace: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class ExplanationLog(IdMixin, Base):
    """LRN-03 R6 / KNW-10 R4: shown explanations, no identity, for sampling."""

    __tablename__ = "knw_explanation_log"
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    exercise_id: Mapped[str] = mapped_column(String(24), index=True)
    lang: Mapped[str] = mapped_column(String(5))
    text: Mapped[str] = mapped_column(Text)


class LibraryItem(IdMixin, Base):
    """KNW-06: curated items; only `approved` are shown."""

    __tablename__ = "knw_library_items"
    source_id: Mapped[str] = mapped_column(String(32))
    external_id: Mapped[str] = mapped_column(String(32), index=True)
    type: Mapped[str] = mapped_column(String(12))  # books | articles | videos | audios
    lang: Mapped[str] = mapped_column(String(5), index=True)
    title: Mapped[str] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(Text, nullable=True)
    topic: Mapped[str] = mapped_column(String(16), default="general")
    origin_url: Mapped[str] = mapped_column(String(400))
    file_url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="candidate")  # candidate | approved | hidden
    thumbnail_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SavedItem(Base):
    """KNW-09: account copy of saved items (guests keep them on the device)."""

    __tablename__ = "knw_saved_items"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(12), primary_key=True)  # answer | card | story | passage
    ref_id: Mapped[str] = mapped_column(String(96), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)  # answer text + source ids + date; question only with consent
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class GlossaryTerm(IdMixin, Base):
    """KNW-03: one approved term per concept per language."""

    __tablename__ = "knw_glossary"
    __table_args__ = (Index("uq_knw_glossary_approved", "concept", "lang", unique=True, postgresql_where="status = 'approved'"),)
    concept: Mapped[str] = mapped_column(String(64))  # Arabic key, e.g. الوضوء
    lang: Mapped[str] = mapped_column(String(5))
    term: Mapped[str] = mapped_column(String(120))
    alternates: Mapped[list[str]] = mapped_column(ARRAY(String(120)), default=list)
    definition: Mapped[str] = mapped_column(Text, default="")
    source_ids: Mapped[list[str]] = mapped_column(ARRAY(String(96)), default=list)
    status: Mapped[str] = mapped_column(String(12), default="proposed")  # proposed | approved


class EvalRun(IdMixin, Base):
    """KNW-04: one run of the 80-question set (3x Rafeeq, 3x bare model)."""

    __tablename__ = "knw_eval_runs"
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    settings: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(12), default="running")
    report: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class EvalAnswer(IdMixin, Base):
    __tablename__ = "knw_eval_answers"
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knw_eval_runs.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[str] = mapped_column(String(12))
    system: Mapped[str] = mapped_column(String(8))  # rafeeq | bare
    attempt: Mapped[int] = mapped_column(Integer)
    output: Mapped[dict] = mapped_column(JSONB)
    checks: Mapped[dict] = mapped_column(JSONB, default=dict)
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    review: Mapped[str | None] = mapped_column(Text, nullable=True)  # Sharia reviewer verdict for normal questions


class ContentApproval(IdMixin, Base):
    """KNW-05: the version of a team-written item that learners see, per
    language (R6). Written only when the Sharia reviewer approves (R5); an
    edit after that leaves this row, so the old approved text stays visible
    until the new one is approved (R3). `snapshot` is the approved text in
    that language and `content_hash` its fingerprint."""

    __tablename__ = "content_approvals"
    __table_args__ = (UniqueConstraint("item_type", "item_id", "lang"),)
    item_type: Mapped[str] = mapped_column(
        String(24)
    )  # lesson | unit | media | daily_card | dhikr | library_item | fixed_reply | badge | challenge_text
    item_id: Mapped[str] = mapped_column(String(64))
    lang: Mapped[str] = mapped_column(String(5))
    status: Mapped[str] = mapped_column(String(12), default="approved")
    content_hash: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict | list | str | None] = mapped_column(JSONB, nullable=True)
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ContentReview(IdMixin, Base):
    """KNW-05 R3/R4: every decision, kept forever: which version (hash), who,
    when, and the written reason for a return."""

    __tablename__ = "knw_reviews"
    __table_args__ = (Index("ix_knw_reviews_item", "item_type", "item_id", "lang"),)
    item_type: Mapped[str] = mapped_column(String(24))
    item_id: Mapped[str] = mapped_column(String(64))
    lang: Mapped[str] = mapped_column(String(5))
    content_hash: Mapped[str] = mapped_column(String(64))
    decision: Mapped[str] = mapped_column(String(8))  # approved | returned
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
