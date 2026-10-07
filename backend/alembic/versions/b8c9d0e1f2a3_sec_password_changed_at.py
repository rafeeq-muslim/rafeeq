"""security audit L7: when the password was last changed.

Additive only: one nullable column, so the previous image still runs on this
schema. NULL means "never changed": every existing access token stays valid.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2 (plt-17 invites.revoked_at)
Create Date: 2026-10-07 02:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: str | Sequence[str] | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_changed_at")
