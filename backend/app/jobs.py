"""Scheduled jobs (single backend instance). Each domain registers its jobs here."""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

log = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="UTC")
_registered = False


def _register() -> None:
    global _registered
    if _registered:
        return
    _registered = True
    for module in (
        "app.motivation.jobs",
        "app.platform.push_jobs",
        "app.platform.retention",
        "app.knowledge.jobs",
        "app.organizations.jobs",
        "app.companion.jobs",
    ):
        try:
            mod = __import__(module, fromlist=["register"])
            mod.register(scheduler)
        except ModuleNotFoundError:
            log.info("jobs module %s not present yet", module)


def start() -> None:
    _register()
    if not scheduler.running:
        scheduler.start()


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
