"""Rafeeq API."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import select, text

from app.companion import router as companion
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.knowledge import ask, discover, review, scripture, tasks
from app.knowledge.eval import router as knw_eval
from app.learning import router as learning
from app.motivation import challenges, indicators
from app.motivation import router as motivation
from app.platform import admin, auth, push
from app.platform import export as data_export
from app.platform.models import User
from app.practice import router as practice

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("rafeeq")


async def _bootstrap_admin() -> None:
    s = get_settings()
    if not (s.bootstrap_admin_username and s.bootstrap_admin_password):
        return
    async with SessionLocal() as session:
        exists = await session.scalar(select(User.id).where(User.roles.any("admin")))  # type: ignore[arg-type]
        if exists:
            return
        session.add(
            User(
                username=s.bootstrap_admin_username.lower(),
                display_name="Rafeeq team",
                password_hash=hash_password(s.bootstrap_admin_password),
                roles=["admin", "team"],
                locale="ar",
            )
        )
        await session.commit()
        log.info("bootstrap admin created")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _bootstrap_admin()
    from app import jobs  # scheduler starts after the app is ready

    jobs.start()
    yield
    jobs.stop()


app = FastAPI(title="Rafeeq API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

for r in (
    auth.router,
    auth.me,
    data_export.router,  # PLT-05 R6
    admin.router,
    learning.router,
    review.router,
    motivation.router,
    indicators.router,
    push.router,
    scripture.router,
    discover.router,
    practice.router,
    companion.router,
    challenges.router,
    ask.router,  # KNW-01
    tasks.router,  # KNW-10
    knw_eval.router,  # KNW-04
):
    app.include_router(r)


@app.get("/api/health")
async def health() -> dict:
    async with SessionLocal() as session:
        await session.execute(text("select 1"))
    return {"ok": True}
