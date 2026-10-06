"""cmp-08: mentor applications.

Additive only: one new table, so the previous image still runs on this
schema. `org_id` has no foreign key (another domain's table, like
`invites.org_id`).

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8 (mot-06 r3, after cmp-05 r5 2b3c4d5e6f7a)
Create Date: 2026-10-06 21:40:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cmp_mentor_applications",
        sa.Column("display_name", sa.String(length=40), nullable=False),
        sa.Column("gender", sa.String(length=1), nullable=False),
        sa.Column("languages", postgresql.ARRAY(sa.String(length=5)), nullable=False),
        sa.Column("locale", sa.String(length=5), nullable=False),
        sa.Column("place", sa.String(length=80), nullable=True),
        sa.Column("about", sa.Text(), nullable=True),
        sa.Column("contact", sa.String(length=254), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("org_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", sa.UUID(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("invite_code", sa.String(length=32), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_cmp_mentor_applications_user_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"], ["users.id"], name=op.f("fk_cmp_mentor_applications_decided_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cmp_mentor_applications")),
    )
    op.create_index(op.f("ix_cmp_mentor_applications_user_id"), "cmp_mentor_applications", ["user_id"], unique=False)
    op.create_index(op.f("ix_cmp_mentor_applications_org_id"), "cmp_mentor_applications", ["org_id"], unique=False)
    op.create_index(op.f("ix_cmp_mentor_applications_status"), "cmp_mentor_applications", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_cmp_mentor_applications_status"), table_name="cmp_mentor_applications")
    op.drop_index(op.f("ix_cmp_mentor_applications_org_id"), table_name="cmp_mentor_applications")
    op.drop_index(op.f("ix_cmp_mentor_applications_user_id"), table_name="cmp_mentor_applications")
    op.drop_table("cmp_mentor_applications")
