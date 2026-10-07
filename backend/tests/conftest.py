import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://rafeeq:rafeeq_dev@127.0.0.1:5442/rafeeq_test")
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-0")
# The shipped default reads islamqa.info and binbaz.org.sa live (go-live approval,
# 2026-10-06). Tests never call real sites: the suite runs the local index, and the
# live tests switch the policy on with fake sites (knw_live_fakes.live).
os.environ.setdefault("ASK_SOURCE_POLICY", "local-index-v2")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core import ratelimit  # noqa: E402
from app.core.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
async def _schema():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean():
    from app.knowledge.ai import gate

    ratelimit.reset()
    gate.reset()  # the global AI gate (security audit A-H3) is per process, like the limiter
    yield
    # DELETE in reverse dependency order: far faster than TRUNCATE on near-empty tables.
    async with engine.begin() as conn:
        for t in reversed(Base.metadata.sorted_tables):
            await conn.execute(t.delete())


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def register(client, username="layla-1", password="pass-1234-word", **extra):
    body = {"display_name": "نخلة الهادئ", "username": username, "password": password, **extra}
    r = await client.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def with_roles(client, username: str, *roles: str) -> str:
    """Register an account, give it roles directly in the database, return its token."""
    from sqlalchemy import update

    from app.core.db import SessionLocal
    from app.platform.models import User

    out = await register(client, username=username)
    async with SessionLocal() as s:
        await s.execute(update(User).where(User.username == username).values(roles=list(roles)))
        await s.commit()
    if "mentor" in roles:
        from tests.cmp_helpers import accept_mentor_rules

        await accept_mentor_rules(out["user"]["id"])  # ORG-02 R2
    return out["access_token"]


async def withdraw(client, token: str, item_type: str, item_id: str, lang: str, note: str = "يحتاج تصحيحًا") -> None:
    """KNW-05: the Sharia reviewer returns the current version in `lang` with a reason,
    which withdraws that exact version until a corrected one is merged (rules.md §1.4)."""
    detail = (await client.get(f"/api/review/items/{item_type}/{item_id}", headers=auth(token))).json()
    body = {"decision": "returned", "hash": detail["langs"][lang]["hash"], "note": note}
    r = await client.post(f"/api/review/items/{item_type}/{item_id}/{lang}", json=body, headers=auth(token))
    assert r.status_code == 200, r.text
