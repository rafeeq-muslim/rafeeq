"""KNW-04 command line.

python -m app.knowledge.eval run [--attempts 3] [--only Q001,Q002] [--systems rafeeq,bare] [--resume RUN_ID]
python -m app.knowledge.eval report [RUN_ID] [--out report.md]
python -m app.knowledge.eval calibrate
"""

import argparse
import asyncio
import json
import logging
import sys
import uuid
from pathlib import Path

from sqlalchemy import select

from app.core.db import SessionLocal
from app.knowledge.ai import client
from app.knowledge.eval import report, runner
from app.knowledge.eval.questions import QuestionFileError, load
from app.knowledge.models import EvalRun


async def _run(a: argparse.Namespace) -> None:
    try:
        qs = load()
    except QuestionFileError as e:  # R1: stop before any call, naming the incomplete questions
        print(e, file=sys.stderr)
        raise SystemExit(2) from None
    if a.only:
        wanted = set(a.only.split(","))
        qs = [q for q in qs if q["id"] in wanted]
    ev = await runner.run(qs, attempts=a.attempts, systems=tuple(a.systems.split(",")), run_id=uuid.UUID(a.resume) if a.resume else None)
    print(ev.report["markdown"])
    print(f"run {ev.id} · status {ev.status} · total AI spend ${await client.spent():.4f}")


async def _report(a: argparse.Namespace) -> None:
    async with SessionLocal() as s:
        ev = (
            await s.get(EvalRun, uuid.UUID(a.run_id))
            if a.run_id
            else await s.scalar(select(EvalRun).order_by(EvalRun.started_at.desc()).limit(1))
        )
        if ev is None:
            raise SystemExit("no run")
        ev.report = await report.build(s, ev, load())
        await s.commit()
        md = ev.report["markdown"]
    if a.out:
        _write(a.out, md)
    print(md)


def _write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


async def _tasks(_: argparse.Namespace) -> None:
    print(json.dumps(await runner.task_checks(), ensure_ascii=False, indent=1))


async def _calibrate(_: argparse.Namespace) -> None:
    print(json.dumps(await runner.calibrate(), ensure_ascii=False, indent=1))


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(message)s")
    p = argparse.ArgumentParser(prog="python -m app.knowledge.eval")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--attempts", type=int, default=3)
    r.add_argument("--only")
    r.add_argument("--systems", default="rafeeq,bare")
    r.add_argument("--resume")
    rp = sub.add_parser("report")
    rp.add_argument("run_id", nargs="?")
    rp.add_argument("--out")
    sub.add_parser("calibrate")
    sub.add_parser("tasks")
    a = p.parse_args()
    asyncio.run({"run": _run, "report": _report, "calibrate": _calibrate, "tasks": _tasks}[a.cmd](a))


if __name__ == "__main__":
    main()
