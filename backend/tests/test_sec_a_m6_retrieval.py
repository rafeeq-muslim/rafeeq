"""Security review 2026-10-07, A-M6: the word search of a question has a
bounded number of terms, no 2-letter prefixes, and a time limit."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.db import SessionLocal
from app.knowledge import search
from app.knowledge.search import MAX_TERMS, retrieve, tsquery
from tests.knw_fakes import add_passages

pytest_plugins = ["tests.knw_fakes"]  # the `ai` fixture

EN = {
    "id": "hadeethenc:en:1",
    "lang": "en",
    "quote_text": "TEST_QUOTE_TEXT ablution before prayer",
    "context_text": "TEST_CONTEXT_TEXT washing",
}


def terms(q: str | None) -> list[str]:
    return (q or "").split(" | ")


def test_m6_a_long_question_gives_at_most_12_terms_its_longest_words():
    hostile = " ".join(f"word{i:03d}" + "x" * (i % 7) for i in range(120))[:600]
    got = terms(tsquery(hostile, "en"))
    assert len(got) == MAX_TERMS == 12
    assert all(len(t.removesuffix(":*")) >= 12 for t in got)  # the longest ones, not the first ones

    # an Arabic word may add its form without the leading particle: still bounded
    ar = " ".join(f"والكلمة{chr(0x0628 + i % 20)}{chr(0x0628 + i // 20)}" for i in range(80))
    assert len(terms(tsquery(ar, "ar"))) <= 2 * MAX_TERMS


def test_m6_an_ordinary_question_keeps_every_content_word_in_order():
    assert tsquery("How do I perform ablution before prayer?", "en") == "how:* | do | perform:* | ablution:* | before:* | prayer:*"
    assert tsquery("كيف أتوضأ قبل الصلاة؟", "ar") == "اتوضا:* | قبل:* | الصلاه:* | صلاه:*"  # the search form: ة is folded to ه


def test_m6_a_two_letter_word_is_never_a_prefix():
    got = terms(tsquery(" ".join(a + b for a in "abcdefghij" for b in "aeiou"), "tl"))
    assert got and not any(t.endswith(":*") for t in got)
    assert "كم" in terms(tsquery("كم عدد الصلوات", "ar")) and "عدد:*" in terms(tsquery("كم عدد الصلوات", "ar"))


async def test_m6_retrieval_queries_run_under_a_time_limit(ai, monkeypatch):
    await add_passages(EN)
    seen: list[str] = []
    real = search._time_limit

    async def spy(session):
        await real(session)
        seen.append(await session.scalar(text("SHOW statement_timeout")))

    monkeypatch.setattr(search, "_time_limit", spy)
    async with SessionLocal() as s:
        default = await s.scalar(text("SHOW statement_timeout"))
        res = await retrieve(s, "ablution before prayer", "en")
        assert [p["id"] for p in res.passages] == ["hadeethenc:en:1"] and res.status == "complete"
        assert seen == ["15s", "15s"]  # the vector query and the word query
        assert await s.scalar(text("SHOW statement_timeout")) == default  # nothing after retrieval inherits it


async def test_m6_a_query_past_the_limit_is_a_failed_channel_not_an_empty_result(ai, monkeypatch):
    await add_passages(EN)
    monkeypatch.setattr(search, "RETRIEVAL_TIMEOUT_MS", 30)
    async with SessionLocal() as s:
        await search._time_limit(s)
        with pytest.raises(DBAPIError, match="statement timeout"):
            await s.execute(text("SELECT pg_sleep(1)"))
        await s.rollback()

    real_hits = search._text_hits

    async def slow_text(session, question, lang, sources):
        await search._time_limit(session)
        await session.execute(text("SELECT pg_sleep(1)"))
        return await real_hits(session, question, lang, sources)

    monkeypatch.setattr(search, "_text_hits", slow_text)
    async with SessionLocal() as s:
        res = await retrieve(s, "ablution before prayer", "en")
        assert res.status == "degraded" and res.reason == "retrieval_db_error"  # KNW-01 §14.1: never «no source»
        assert await s.scalar(text("SELECT 1")) == 1  # the session is usable afterwards
