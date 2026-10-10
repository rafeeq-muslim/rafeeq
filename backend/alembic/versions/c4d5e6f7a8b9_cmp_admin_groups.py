"""cmp-admin-groups: group status (CMP-05 R8) and escalated private threads (CMP-02 R8).

- `cmp_groups.status`: active | paused | closed, set by the team. «Needs a
  mentor» is not stored: it follows from the mentor's standing (CMP-05 R9).
- `cmp_help_requests.escalated_at`: a private mentor thread turned urgent
  keeps its kind, so the learner and the mentor stay in one thread and the
  team reads all of it (owner decision 2026-10-10).

Additive only: a column with a server default and a nullable column, so the
previous image still runs on this schema (it ignores both).

Revises f9a0b1c2d3e4, the only head on origin/main 49fad2c. plt-admin-limits
claims d5e6f7a8b9c0 on the same parent: whichever merges second re-points
its own `down_revision` (one line).

Revision ID: c4d5e6f7a8b9
Revises: f9a0b1c2d3e4
Create Date: 2026-10-10 13:10:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "f9a0b1c2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cmp_groups", sa.Column("status", sa.String(length=10), nullable=False, server_default="active"))
    op.add_column("cmp_help_requests", sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("cmp_help_requests", "escalated_at")
    op.drop_column("cmp_groups", "status")
