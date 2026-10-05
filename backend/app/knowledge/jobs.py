"""Knowledge jobs (registered from app/jobs.py):

- KNW-06 (plan §8.3): weekly link check of library items; broken ones are hidden.
- KNW-02 §3.6: embed a bounded batch of passages per run, so production
  fills its vectors gradually and within the AI budget."""

import logging

from app.core.config import get_settings

log = logging.getLogger("rafeeq.knowledge.jobs")


async def embed_batch() -> None:
    st = get_settings()
    if not st.openrouter_api_key or st.knw_embed_job_limit <= 0:
        return
    from app.knowledge import embed

    sources = [s for s in st.knw_answer_sources.split(",") if s]
    result = await embed.run(sources=sources, limit=st.knw_embed_job_limit)
    if result["embedded"] or result["stopped"]:
        log.info("embedding job: %s", result)


def register(scheduler) -> None:
    from app.knowledge.library import scheduled_check

    scheduler.add_job(scheduled_check, "interval", weeks=1, id="knw_library_links", max_instances=1, coalesce=True, replace_existing=True)
    scheduler.add_job(embed_batch, "interval", minutes=15, id="knw_embed_batch", max_instances=1, coalesce=True, replace_existing=True)
