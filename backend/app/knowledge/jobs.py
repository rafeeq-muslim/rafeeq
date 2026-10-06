"""Knowledge jobs (registered from app/jobs.py):

- KNW-06 (plan §8.3): weekly link check of library items; broken ones are hidden.
- KNW-02 §3.6 / SC3: embed a bounded batch of passages per run, so production
  fills its vectors gradually and within the embedding job's own daily
  ceiling (`AI_EMBED_DAILY_BUDGET_USD`). The sources come from the one
  answer-source policy (source_policy.py), and every run records coverage
  per source and language (embed.record_coverage).
- KNW-02 R6: once at start, refresh the approved team cards in the index."""

import logging

from app.core.config import get_settings
from app.core.db import SessionLocal

log = logging.getLogger("rafeeq.knowledge.jobs")


async def embed_batch() -> None:
    st = get_settings()
    if not st.openrouter_api_key or st.knw_embed_job_limit <= 0:
        return
    from app.knowledge import embed, source_policy

    async with SessionLocal() as s:
        sources = (await source_policy.eligible_sources(s)).sources
    if not sources:
        return
    result = await embed.run(sources=sources, limit=st.knw_embed_job_limit)
    coverage = await embed.record_coverage(sources, result)
    if result["embedded"] or result["stopped"]:
        log.info("embedding job: %s; coverage %s", result, coverage)


async def refresh_cards() -> None:
    """KNW-02 R6: at every start (so after every deploy) the indexed team cards
    are made equal to the approved ones."""
    from app.knowledge import cards

    try:
        await cards.refresh()
    except Exception:  # never stop the app over the index; the next approval or start retries
        log.exception("approved cards refresh failed")


def register(scheduler) -> None:
    from app.knowledge.library import scheduled_check

    st = get_settings()
    scheduler.add_job(refresh_cards, "date", id="knw_cards_refresh", max_instances=1, replace_existing=True)
    scheduler.add_job(scheduled_check, "interval", weeks=1, id="knw_library_links", max_instances=1, coalesce=True, replace_existing=True)
    scheduler.add_job(
        embed_batch,
        "interval",
        minutes=max(st.knw_embed_job_minutes, 1),
        id="knw_embed_batch",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
