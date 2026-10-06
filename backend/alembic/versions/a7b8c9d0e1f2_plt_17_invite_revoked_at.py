"""plt-17: invite codes can be revoked.

Additive only: one nullable column, so the previous image still runs on this
schema.

Revision ID: a7b8c9d0e1f2
Revises: d4e5f6a7b8c9 (cmp-08 mentor applications)
Create Date: 2026-10-07 00:30:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("invites", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("invites", "revoked_at")
