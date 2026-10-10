"""Limits the admin can change (plt-admin-limits; owner decision 2026-10-10:
"These limits must be editable by superadmin").

There is no role above `admin` in Rafeeq, so "superadmin" is the admin role.

Every abuse and traffic limit added by the 2026-10-07 security work reads its
value here. The code default is the value it had before; a row in
`platform_limits` overrides it. Values are cached in memory for `TTL_S`, and
an admin's change reaches this process at once (one backend process: see
infra/compose.prod.yml).

    await limits.value("ask_per_minute")   # in async code: refreshes when stale
    limits.get("urgent_pushes_per_hour")    # in sync code: the cached value

A change is audited in `platform_limit_changes`: the limit, the old and new
values and the admin's id only.
"""

import asyncio
import logging
import math
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.core.db import Base, IdMixin, SessionLocal

log = logging.getLogger(__name__)

TTL_S = 30.0


class LimitValue(Base):
    """An admin's value for one limit; no row = the code default."""

    __tablename__ = "platform_limits"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[float] = mapped_column(Float)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LimitChange(IdMixin, Base):
    """Who changed which limit: the admin's id, nothing else about them."""

    __tablename__ = "platform_limit_changes"
    key: Mapped[str] = mapped_column(String(64), index=True)
    old_value: Mapped[float] = mapped_column(Float)
    new_value: Mapped[float] = mapped_column(Float)
    admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


@dataclass(frozen=True)
class Spec:
    group: str  # reports | orgs | ai | budget | urgent
    kind: str  # "int" | "usd" | "minutes"
    lo: float
    hi: float
    default: Callable[[], float]


def _const(v: float) -> Callable[[], float]:
    return lambda: v


# Order = the order on the admin page. Defaults = the values before 2026-10-10.
SPECS: dict[str, Spec] = {
    # companion/safety.py (security review B-L9): reports that hide a message for everyone
    "report_hides_per_reporter_day": Spec("reports", "int", 0, 100, _const(5)),
    "report_hides_per_author_day": Spec("reports", "int", 0, 50, _const(2)),
    # organizations/links.py (B-M4): new links a day per organisation code
    "org_links_per_code_day": Spec("orgs", "int", 1, 100_000, _const(200)),
    # AI: per client only (owner 2026-10-10: no global cap, no queue)
    "ai_concurrent_per_client": Spec("ai", "int", 1, 50, _const(3)),
    "ask_per_minute": Spec("ai", "int", 1, 1000, _const(8)),
    "ask_per_day": Spec("ai", "int", 1, 100_000, _const(120)),
    "explain_per_minute": Spec("ai", "int", 1, 1000, _const(20)),
    "explain_per_day": Spec("ai", "int", 1, 100_000, _const(150)),
    "guide_per_minute": Spec("ai", "int", 1, 1000, _const(20)),
    "guide_per_day": Spec("ai", "int", 1, 100_000, _const(60)),
    "home_order_per_minute": Spec("ai", "int", 1, 1000, _const(10)),
    "home_order_per_day": Spec("ai", "int", 1, 100_000, _const(20)),
    # knowledge/ai/client.py: money, not queueing. Defaults follow the env settings.
    "ai_daily_budget_usd": Spec("budget", "usd", 0, 1000, lambda: get_settings().ai_daily_budget_usd),
    "ai_total_budget_usd": Spec("budget", "usd", 0, 100_000, lambda: get_settings().ai_budget_usd),
    # companion/urgent.py (A-H4): pushes about urgent requests
    "urgent_repeat_minutes": Spec("urgent", "minutes", 1, 240, _const(10)),
    "urgent_pushes_per_hour": Spec("urgent", "int", 1, 1000, _const(20)),
    # knowledge/ask.py (A-H4): danger alerts to everyone
    "danger_alert_every_minutes": Spec("urgent", "minutes", 1, 1440, _const(30)),
    "danger_alerts_per_address_hour": Spec("urgent", "int", 1, 100, _const(3)),
}

_values: dict[str, float] = {}
_loaded_at = 0.0
_loading: asyncio.Task | None = None
_generation = 0


def reset() -> None:
    """Tests: forget the cache (the tables are emptied between tests)."""
    global _loaded_at, _loading
    _values.clear()
    _loaded_at = 0.0
    _loading = None


def override(key: str, value: float) -> None:
    """Tests: a value as if an admin had saved it, without the database."""
    global _loaded_at
    _values[key] = float(value)
    _loaded_at = time.monotonic()


def default(key: str) -> float:
    return SPECS[key].default()


def _typed(key: str, v: float) -> float:
    return v if SPECS[key].kind == "usd" else int(v)


def get(key: str) -> float:
    """The cached value (sync). A stale cache is refreshed in the background."""
    if time.monotonic() - _loaded_at > TTL_S:
        _refresh_soon()
    v = _values.get(key)
    return _typed(key, default(key) if v is None else v)


async def value(key: str) -> float:
    await refresh()
    return get(key)


async def refresh(force: bool = False) -> None:
    """Reload from the database when stale. Many requests arriving together
    share one load (one connection), never one each."""
    global _loading
    if not force and time.monotonic() - _loaded_at <= TTL_S:
        return
    loop = asyncio.get_running_loop()
    if force or _loading is None or _loading.done() or _loading.get_loop() is not loop:
        _loading = loop.create_task(_load())
    await asyncio.shield(_loading)


async def _load() -> None:
    global _loaded_at, _generation
    _generation += 1
    mine = _generation
    try:
        async with SessionLocal() as s:
            rows = (await s.execute(select(LimitValue.key, LimitValue.value))).all()
    except Exception:  # a limit read must never fail a request: keep what is cached
        log.exception("could not read limits; keeping cached values")
        _loaded_at = time.monotonic()
        return
    if mine != _generation:
        return  # a later load (after an admin's change) has the newer values
    _values.clear()
    _values.update({k: v for k, v in rows if k in SPECS})
    _loaded_at = time.monotonic()


def _refresh_soon() -> None:
    global _loading
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:  # no running loop
        return
    if _loading is None or _loading.done() or _loading.get_loop() is not loop:
        _loading = loop.create_task(_load())


def snapshot() -> list[dict]:
    return [
        {"key": k, "group": s.group, "kind": s.kind, "min": s.lo, "max": s.hi, "default": _typed(k, s.default()), "value": get(k)}
        for k, s in SPECS.items()
    ]


def check(key: str, v: float) -> float:
    """The value to store, or ValueError("unknown" | "not_integer" | "out_of_range")."""
    spec = SPECS.get(key)
    if spec is None:
        raise ValueError("unknown")
    if not math.isfinite(v):
        raise ValueError("out_of_range")
    if spec.kind != "usd" and float(v) != int(v):
        raise ValueError("not_integer")
    if not spec.lo <= v <= spec.hi:
        raise ValueError("out_of_range")
    return round(float(v), 2) if spec.kind == "usd" else float(int(v))


async def save(session, key: str, v: float | None, admin_id: uuid.UUID) -> None:
    """Set `key` to `v` (None = back to the default) and audit it. Commits."""
    await refresh(force=True)
    old = float(get(key))
    row = await session.get(LimitValue, key)
    if v is None:
        if row is not None:
            await session.delete(row)
        new = float(default(key))
    else:
        new = check(key, v)
        if row is None:
            session.add(LimitValue(key=key, value=new))
        else:
            row.value = new
    session.add(LimitChange(key=key, old_value=old, new_value=new, admin_id=admin_id))
    await session.commit()
    await refresh(force=True)  # this process uses the new value from now on
