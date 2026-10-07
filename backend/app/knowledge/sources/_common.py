"""Shared helpers for source normalizers (KNW-02, plan §3.4 / §12.1).

Every normalizer turns raw files kept OUTSIDE the repo into JSONL lines whose
keys match the `knw_passages` table. Text is never changed except stripping
HTML tags (and decoding entities); letters are never touched.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
from collections import Counter
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from pathlib import Path

KINDS = {
    "quran_arabic",
    "quran_translation",
    "quran_tafsir",
    "hadith",
    "fatwa",
    "article",
    "book_section",
    "story",
    "benefit",
    "glossary",
    "approved_card",  # KNW-02 R6: the team's approved lesson cards (app.knowledge.cards)
}
LANGS = {"ar", "en", "tl"}
KEYS = (
    "id",
    "source_id",
    "kind",
    "lang",
    "ref",
    "ref_key",
    "quote_text",
    "context_text",
    "meta",
    "version",
    "origin_url",
    "fetched_at",
    "text_hash",
)

DATA_ROOT = Path(os.environ.get("RAFEEQ_DATA_DIR", Path.home() / ".local/share/rafeeq"))
SOURCES_DIR = DATA_ROOT / "sources"
CORPUS_DIR = DATA_ROOT / "corpus"

_TAG = re.compile(r"<[^>]+>")
_BLOCK = re.compile(r"(?i)<\s*(br|/p|/div|/li|/h[1-6]|/blockquote|/tr)\s*/?>")


def _drop_tags(s: str) -> str:
    """Exactly `re.sub(r"<[^>]+>", "", s)`, in linear time. On the whole text
    the pattern is quadratic when many "<" have no ">" after them (each one
    is scanned to the end), and this runs on text fetched from other sites
    (security review 2026-10-07, A-M7). A tag ends with ">", so nothing
    after the last ">" can be part of one: the pattern runs only up to it,
    where every "<" it tries either matches up to the next ">" (and those
    letters are not scanned again) or is the "<" of "<>"."""
    end = s.rfind(">") + 1
    return _TAG.sub("", s[:end]) + s[end:]


def _trim_line_ends(s: str) -> str:
    """Exactly `re.sub(r"[ \t]+\n", "\n", s)`, in one pass (that pattern is
    quadratic on a long run of spaces with no newline after it)."""
    lines = s.split("\n")
    return "\n".join([*(line.rstrip(" \t") for line in lines[:-1]), lines[-1]])


def strip_html(s: str) -> str:
    """Remove tags only. Block-level closers become newlines so paragraphs
    survive. Linear in the length of the text, and byte for byte what the
    earlier regular expressions returned (tests compare the two)."""
    if not s:
        return ""
    s = _BLOCK.sub("\n", s)
    s = _drop_tags(s)
    s = html.unescape(s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = _trim_line_ends(s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def text_hash(s: str) -> str:
    return "sha256:" + hashlib.sha256(s.encode("utf-8")).hexdigest()


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def iso_from_mtime(p: Path) -> str:
    return datetime.fromtimestamp(p.stat().st_mtime, UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def split_paragraphs(text: str, min_words: int = 300, max_words: int = 700) -> list[str]:
    """Split on paragraph boundaries into chunks of roughly min..max words.

    A single paragraph longer than max_words is kept whole (never cut mid-paragraph).
    Text is sliced, not rewritten: each chunk is the original paragraphs joined by "\n\n".
    """
    paras = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
    if not paras:
        return []
    chunks: list[list[str]] = []
    cur: list[str] = []
    n = 0
    for p in paras:
        w = len(p.split())
        if cur and n + w > max_words:
            chunks.append(cur)
            cur, n = [], 0
        cur.append(p)
        n += w
        if n >= min_words:
            chunks.append(cur)
            cur, n = [], 0
    if cur:
        # merge a tiny tail into the previous chunk
        if chunks and n < min_words // 3:
            chunks[-1].extend(cur)
        else:
            chunks.append(cur)
    return ["\n".join(c) for c in chunks]


def make_passage(
    *,
    id: str,
    source_id: str,
    kind: str,
    lang: str,
    ref: dict,
    ref_key: str,
    quote_text: str,
    context_text: str = "",
    meta: dict | None = None,
    version: str,
    origin_url: str,
    fetched_at: str,
) -> dict:
    assert kind in KINDS, kind
    assert lang in LANGS, lang
    assert len(id) <= 96, id
    assert len(source_id) <= 32
    assert len(ref_key) <= 64, ref_key
    assert len(version) <= 32, version
    assert len(origin_url) <= 400, origin_url
    return {
        "id": id,
        "source_id": source_id,
        "kind": kind,
        "lang": lang,
        "ref": ref,
        "ref_key": ref_key,
        "quote_text": quote_text,
        "context_text": context_text or "",
        "meta": meta or {},
        "version": version,
        "origin_url": origin_url,
        "fetched_at": fetched_at,
        "text_hash": text_hash(quote_text),
    }


def split_passages(base: dict, text: str) -> Iterator[dict]:
    """Yield one passage, or several suffixed :p1, :p2 ... for long texts."""
    parts = split_paragraphs(text)
    if len(parts) <= 1:
        yield make_passage(**{**base, "quote_text": text})
        return
    for i, part in enumerate(parts, 1):
        meta = {**(base.get("meta") or {}), "part": i, "parts": len(parts)}
        yield make_passage(**{**base, "id": f"{base['id']}:p{i}", "quote_text": part, "meta": meta})


def write_jsonl(source_id: str, passages: Iterable[dict], out: Path | None = None) -> Counter:
    """Write passages; skip (and count) rows with no id, version or text (plan §3.5)."""
    out = out or CORPUS_DIR / f"{source_id}.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    counts: Counter = Counter()
    seen: set[str] = set()
    tmp = out.with_suffix(".jsonl.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for p in passages:
            if not p.get("id") or not p.get("version") or not p.get("quote_text", "").strip():
                counts["rejected"] += 1
                continue
            if p["id"] in seen:
                counts["duplicate"] += 1
                continue
            seen.add(p["id"])
            assert tuple(p.keys()) == KEYS, p.keys()
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
            counts[p["lang"]] += 1
            counts[f"{p['lang']}:{p['kind']}"] += 1
    tmp.replace(out)  # all-or-nothing (KNW-02 R5)
    print(f"{out}: {dict(counts)}")
    return counts
