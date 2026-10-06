"""sec-b-h1: a mentor invite carries the gender staff approved.

Additive only: one nullable column, so the previous image still runs on this
schema (it ignores the column; invites without a gender keep the old
behaviour: the registrant states it).

Revision ID: f0a1b2c3d4e5
Revises: a7b8c9d0e1f2 (plt-17 invite revoked_at)
Create Date: 2026-10-07 02:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: str | Sequence[str] | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("invites", sa.Column("gender", sa.String(length=1), nullable=True))


def downgrade() -> None:
    op.drop_column("invites", "gender")
