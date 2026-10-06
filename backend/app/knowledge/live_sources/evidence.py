"""PRD live v3 §6, §7: from a fetched record to evidence the composer may use.

- What leaves the backend: only a search form of the question (its canonical
  words, at most MAX_TERMS words; e-mail addresses, links and long digit runs
  removed). Never the conversation or the asker's identity.
- External text is data: HTML removed (letters never changed); a record
  whose text carries Rafeeq's own marker syntax is refused, so a page can
  never smuggle a {{q:...}} marker into an answer.
- A long record is cut on paragraph boundaries into parts of at most
  CHUNK_CHARS (the composer reads PASSAGE_CHARS per passage); the parts that
  share most words with the question are kept, at most `chunks_per_record`.
- Ranking is the same for every source: the source's own rank position and
  the words shared with the question, then a fixed tie-break by evidence id.
  No source name enters the score (§7.2).
- De-duplication only removes repeats (same evidence id, or the same text of
  the same source); it is never a quota (§6)."""

import hashlib
import re
from datetime import UTC, datetime

from app.knowledge.ai.textcheck import words
from app.knowledge.live_sources import types as T
from app.knowledge.live_sources.registry import Record

MAX_TERMS = 12
MAX_TERMS_CHARS = 160
CHUNK_CHARS = 1300
RRF_K = 60

_EMAIL = re.compile(r"\S+@\S+")
_URL = re.compile(r"(?i)\b(?:https?://|www\.)\S+")
_LONG_DIGITS = re.compile(r"\d[\d\s\-]{4,}\d")
_MARKUP = re.compile(r"\{\{|\}\}")
_STOP = {
    "en": {
        "the",
        "a",
        "an",
        "of",
        "to",
        "is",
        "are",
        "in",
        "on",
        "for",
        "and",
        "or",
        "do",
        "does",
        "i",
        "my",
        "me",
        "it",
        "be",
        "can",
        "what",
        "how",
    },
    "ar": {"في", "من", "على", "عن", "الى", "إلى", "ما", "هل", "هو", "هي", "و", "أو", "او", "يا", "ان", "أن", "إن", "لي", "انا", "أنا"},
    "tl": {"ang", "ng", "sa", "mga", "na", "ay", "ba", "po", "ko", "ako", "ano", "paano"},
}


def search_terms(canonical: str) -> str:
    """The minimum sent to a source: the canonical question words, capped."""
    t = _URL.sub(" ", canonical)
    t = _EMAIL.sub(" ", t)
    t = _LONG_DIGITS.sub(" ", t)
    out = " ".join(t.split()[:MAX_TERMS])
    return out[:MAX_TERMS_CHARS].strip()


def _content_words(text: str, lang: str) -> set[str]:
    stop = _STOP.get(lang, set())
    out = set()
    for w in words(text):
        if len(w) < 2 or w in stop:
            continue
        out.add(w)
        if lang == "ar" and w.startswith("ال") and len(w) > 4:
            out.add(w[2:])
    return out


def overlap(question_words: set[str], text: str, lang: str) -> float:
    """Share of the question's content words found in `text` (0..1)."""
    if not question_words:
        return 0.0
    return len(question_words & _content_words(text, lang)) / len(question_words)


def chunks(text: str, limit: int = CHUNK_CHARS) -> list[str]:
    """Paragraph-bounded parts of at most `limit` characters (a longer single
    paragraph is cut at a sentence end or a space; letters are never changed)."""
    out: list[str] = []
    cur = ""
    for para in (p.strip() for p in re.split(r"\n+", text)):
        if not para:
            continue
        while len(para) > limit:
            cut = max(para.rfind(". ", 0, limit), para.rfind("。", 0, limit), para.rfind("، ", 0, limit), para.rfind(" ", 0, limit))
            cut = cut + 1 if cut > limit // 3 else limit
            piece, para = para[:cut].strip(), para[cut:].strip()
            if cur:
                out.append(cur)
                cur = ""
            out.append(piece)
        if cur and len(cur) + 1 + len(para) > limit:
            out.append(cur)
            cur = ""
        cur = f"{cur}\n{para}" if cur else para
    if cur:
        out.append(cur)
    return out


def content_hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def from_record(
    rec: Record,
    cand: T.Candidate,
    *,
    question: str,
    lang: str,
    provider: str,
    request_id: str,
    chunks_per_record: int,
) -> list[T.Evidence]:
    """Evidence parts of one fetched record. Empty when the record has no
    usable text, or carries marker syntax (refused, never edited)."""
    texts = [rec.body, rec.title, rec.question, rec.summary]
    if not rec.body.strip() or any(_MARKUP.search(t or "") for t in texts):
        return []
    qwords = _content_words(question, lang)
    parts = chunks(rec.body)
    scored = sorted(
        ((overlap(qwords, p, lang), i, p) for i, p in enumerate(parts)),
        key=lambda x: (-x[0], x[1]),
    )[: max(1, chunks_per_record)]
    head = rec.title + (f"\n\n{rec.question}" if rec.question and rec.question != rec.title else "")
    if rec.summary:
        head += f"\n\n{rec.summary}"
    title_hit = overlap(qwords, f"{rec.title} {rec.question}", lang)
    at = now_iso()
    out = []
    for score, i, text in sorted(scored, key=lambda x: x[1]):
        out.append(
            T.Evidence(
                evidence_id=f"live:{cand.source_id}:{rec.lang}:{rec.external_id}:c{i + 1}",
                source_id=cand.source_id,
                provider_id=provider,
                external_record_id=rec.external_id,
                canonical_url=rec.canonical_url,
                title=rec.title,
                lang=rec.lang,
                source_text=text,
                content_hash=content_hash(text),
                retrieved_at=at,
                request_id=request_id,
                kind=rec.kind,
                context_text=head[:1400],
                attribution=rec.attribution,
                rank_score=round(1 / (RRF_K + cand.rank) + 0.02 * (score + title_hit), 6),
                provenance=[
                    {"op": "search", "rank": cand.rank},
                    {"op": "fetch", "url": rec.canonical_url, "at": at, "part": i + 1, "parts": len(parts)},
                ],
            )
        )
    return out


def dedupe(items: list[T.Evidence]) -> list[T.Evidence]:
    seen_ids: set[str] = set()
    seen_text: set[tuple[str, str]] = set()
    out = []
    for e in items:
        key = (e.source_id, e.content_hash)
        if e.evidence_id in seen_ids or key in seen_text:
            continue
        seen_ids.add(e.evidence_id)
        seen_text.add(key)
        out.append(e)
    return out


def rank(items: list[T.Evidence]) -> list[T.Evidence]:
    """Source-neutral order: score, then the evidence id (fixed tie-break)."""
    return sorted(dedupe(items), key=lambda e: (-e.rank_score, e.evidence_id))
