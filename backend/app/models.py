"""Imports every domain's models so Alembic sees the full metadata."""

from app.core.db import Base  # noqa: F401
from app.core.events import OutboxEvent  # noqa: F401
from app.platform import models as platform_models  # noqa: F401

for _module in ("learning", "motivation", "knowledge", "companion", "practice"):
    try:
        __import__(f"app.{_module}.models")
    except ModuleNotFoundError:
        pass
