"""Database engine, session and declarative base."""

import uuid
from collections.abc import AsyncIterator
from datetime import datetime

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import get_settings

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


class IdMixin:
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# hide_parameters (security audit H2/M3): a failed statement is logged without
# its bound values, which can be personal data (emails, contacts, messages).
engine = create_async_engine(get_settings().database_url, pool_pre_ping=True, pool_size=10, pool_timeout=5, hide_parameters=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def release(session: AsyncSession) -> None:
    """Security audit 2026-10-07 A-M1: give the session's connection back to
    the pool before a slow model or network call, so waiting on a provider
    never keeps a connection (pool: 10 + 10 overflow; `pool_timeout` 5 s).
    The session stays usable: its next statement takes a connection again,
    and loaded objects stay readable (`expire_on_commit=False`). It commits,
    so call it only where the request has written nothing it may still undo."""
    await session.commit()
