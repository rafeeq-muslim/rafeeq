"""plt-admin-limits: limits the admin can change, and who changed them.

Owner decision 2026-10-10: the abuse and traffic limits of the 2026-10-07
security work are editable by the admin. Additive only: two new tables; no
row = the code default, so the previous image keeps running.

Revises f9a0b1c2d3e4, the only head on origin/main (49fad2c). A branch that
merges later re-points its own `down_revision` to the head then on main.

Revision ID: d5e6f7a8b9c0
Revises: f9a0b1c2d3e4
Create Date: 2026-10-10 13:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: str | Sequence[str] | None = "f9a0b1c2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "platform_limits",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_platform_limits")),
    )
    op.create_table(
        "platform_limit_changes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("old_value", sa.Float(), nullable=False),
        sa.Column("new_value", sa.Float(), nullable=False),
        sa.Column("admin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["admin_id"], ["users.id"], name=op.f("fk_platform_limit_changes_admin_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_platform_limit_changes")),
    )
    op.create_index(op.f("ix_platform_limit_changes_key"), "platform_limit_changes", ["key"], unique=False)
    op.create_index(op.f("ix_platform_limit_changes_created_at"), "platform_limit_changes", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_platform_limit_changes_created_at"), table_name="platform_limit_changes")
    op.drop_index(op.f("ix_platform_limit_changes_key"), table_name="platform_limit_changes")
    op.drop_table("platform_limit_changes")
    op.drop_table("platform_limits")
