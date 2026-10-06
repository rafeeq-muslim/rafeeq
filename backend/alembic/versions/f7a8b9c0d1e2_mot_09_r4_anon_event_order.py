"""mot-09 r4: anonymous events carry the device's own order.

The device numbers its anonymous events (a counter kept on the device), so
"the next first answer after «لماذا؟»" is found in the order things
happened, even when a whole offline queue arrives in one request with one
arrival time. Additive only: a nullable column; older events keep null and
fall back to arrival order.

Based on org-01-03's head (e5f6a7b8c9d0), as agreed on the agents' board.

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-10-06 19:10:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("mot_anon_events", sa.Column("seq", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("mot_anon_events", "seq")
