"""cmp-01..05, mot-06: help requests for guests and danger alerts, mentor
links, mentee status copy, reports and blocks, group mentor rows, wider
challenge status

Revision ID: d1e2f3a4b5c6
Revises: c7d8e9f0a1b2
Create Date: 2026-10-06 00:30:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d1e2f3a4b5c6"
down_revision: str | Sequence[str] | None = "c7d8e9f0a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # CMP-01 / CMP-02
    op.add_column("cmp_help_requests", sa.Column("source", sa.String(length=12), nullable=True))
    op.add_column("cmp_help_requests", sa.Column("prefer_gender", sa.String(length=1), nullable=True))
    op.add_column("cmp_help_requests", sa.Column("ask_id", sa.String(length=64), nullable=True))
    op.add_column("cmp_help_requests", sa.Column("push_endpoint", sa.String(length=1024), nullable=True))
    op.add_column("cmp_help_requests", sa.Column("first_reply_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_cmp_help_requests_ask_id"), "cmp_help_requests", ["ask_id"], unique=False)
    op.add_column("cmp_help_messages", sa.Column("hidden", sa.Boolean(), server_default=sa.false(), nullable=False))

    # CMP-03 R5
    op.add_column("cmp_mentor_links", sa.Column("welcomed_at", sa.DateTime(timezone=True), nullable=True))

    # CMP-02 R6
    op.create_table(
        "cmp_mentee_status",
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("status", sa.String(length=12), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_cmp_mentee_status_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_cmp_mentee_status")),
    )

    # CMP-04
    op.add_column("cmp_reports", sa.Column("reporter_guest_hash", sa.String(length=64), nullable=True))
    op.add_column("cmp_reports", sa.Column("group_id", UUID, nullable=True))
    op.add_column("cmp_reports", sa.Column("priority", sa.String(length=6), server_default="normal", nullable=False))
    op.create_index(op.f("ix_cmp_reports_target_id"), "cmp_reports", ["target_id"], unique=False)
    op.create_table(
        "cmp_blocks",
        sa.Column("blocker_id", UUID, nullable=True),
        sa.Column("blocker_guest_hash", sa.String(length=64), nullable=True),
        sa.Column("blocked_id", UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", UUID, nullable=False),
        sa.ForeignKeyConstraint(["blocked_id"], ["users.id"], name=op.f("fk_cmp_blocks_blocked_id_users"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocker_id"], ["users.id"], name=op.f("fk_cmp_blocks_blocker_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cmp_blocks")),
    )
    op.create_index(op.f("ix_cmp_blocks_blocked_id"), "cmp_blocks", ["blocked_id"], unique=False)
    op.create_index(op.f("ix_cmp_blocks_blocker_id"), "cmp_blocks", ["blocker_id"], unique=False)
    op.create_index(op.f("ix_cmp_blocks_blocker_guest_hash"), "cmp_blocks", ["blocker_guest_hash"], unique=False)

    # MOT-06
    op.add_column("mot_group_members", sa.Column("is_mentor", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.alter_column("mot_challenges", "status", type_=sa.String(length=16), existing_type=sa.String(length=12))


def downgrade() -> None:
    op.alter_column("mot_challenges", "status", type_=sa.String(length=12), existing_type=sa.String(length=16))
    op.drop_column("mot_group_members", "is_mentor")
    op.drop_index(op.f("ix_cmp_blocks_blocker_guest_hash"), table_name="cmp_blocks")
    op.drop_index(op.f("ix_cmp_blocks_blocker_id"), table_name="cmp_blocks")
    op.drop_index(op.f("ix_cmp_blocks_blocked_id"), table_name="cmp_blocks")
    op.drop_table("cmp_blocks")
    op.drop_index(op.f("ix_cmp_reports_target_id"), table_name="cmp_reports")
    op.drop_column("cmp_reports", "priority")
    op.drop_column("cmp_reports", "group_id")
    op.drop_column("cmp_reports", "reporter_guest_hash")
    op.drop_table("cmp_mentee_status")
    op.drop_column("cmp_mentor_links", "welcomed_at")
    op.drop_column("cmp_help_messages", "hidden")
    op.drop_index(op.f("ix_cmp_help_requests_ask_id"), table_name="cmp_help_requests")
    op.drop_column("cmp_help_requests", "first_reply_at")
    op.drop_column("cmp_help_requests", "push_endpoint")
    op.drop_column("cmp_help_requests", "ask_id")
    op.drop_column("cmp_help_requests", "prefer_gender")
    op.drop_column("cmp_help_requests", "source")
