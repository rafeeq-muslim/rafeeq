"""In-process domain events (docs/domains.md: domains talk through events).

A domain publishes an event; handlers registered by other domains run in
the same transaction. Every event is also written to the `outbox` table so
the history is inspectable. Names follow docs/agents/glossary.md.
"""

from collections import defaultdict
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin

Handler = Callable[[AsyncSession, dict[str, Any]], Awaitable[None]]
_handlers: dict[str, list[Handler]] = defaultdict(list)


class OutboxEvent(IdMixin, Base):
    __tablename__ = "outbox"
    name: Mapped[str] = mapped_column(String(64), index=True)
    source: Mapped[str] = mapped_column(String(8))
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def subscribe(name: str) -> Callable[[Handler], Handler]:
    def deco(fn: Handler) -> Handler:
        _handlers[name].append(fn)
        return fn

    return deco


async def publish(session: AsyncSession, name: str, source: str, payload: dict[str, Any]) -> None:
    session.add(OutboxEvent(name=name, source=source, payload=payload))
    for handler in _handlers.get(name, []):
        await handler(session, payload)
