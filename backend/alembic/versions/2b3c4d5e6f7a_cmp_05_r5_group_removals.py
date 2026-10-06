"""cmp-05 r5: a member removed from a group cannot rejoin it by code.

Additive only: a new table, so the previous image still runs on this schema.
One row per (group, person) the mentor or the team removed; it cascades with
the group and with the person's account (PLT-05 R5).

Revision ID: 2b3c4d5e6f7a
Revises: 1a9e0d5c3b7f
Create Date: 2026-10-06 21:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "2b3c4d5e6f7a"
down_revision: str | Sequence[str] | None = "1a9e0d5c3b7f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cmp_group_removals",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["cmp_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "user_id"),
    )
    op.create_index(op.f("ix_cmp_group_removals_user_id"), "cmp_group_removals", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_cmp_group_removals_user_id"), table_name="cmp_group_removals")
    op.drop_table("cmp_group_removals")
