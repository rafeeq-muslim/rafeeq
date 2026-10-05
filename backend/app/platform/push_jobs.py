"""MOT-05: check reminders every 5 minutes (reminder times are minute-precise
in the learner's own timezone; 5 minutes late is gentle enough)."""

from apscheduler.triggers.interval import IntervalTrigger

from app.platform.push import run_reminders


def register(scheduler) -> None:
    scheduler.add_job(
        run_reminders, IntervalTrigger(minutes=5), id="mot-05-reminders", replace_existing=True, max_instances=1, coalesce=True
    )
