"""org-01..03: organisations, their codes, members, learner links, daily
figures; organisation invites; mentor rules and suspension.

Additive only, so the previous image still runs on this schema: new tables,
and new nullable columns or columns with a server default.

Existing mentors get `rules_accepted_at` NULL: the next time they open the
inbox they read and accept the mentor rules once (ORG-02 R2: the rules are the
same for every mentor). Nobody is suspended (`suspended` false).

Revision ID: e5f6a7b8c9d0
Revises: b7c8d9e0f1a2
Create Date: 2026-10-06 23:30:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "org_organizations",
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("languages", postgresql.ARRAY(sa.String(length=5)), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_org_organizations")),
    )
    op.create_table(
        "org_codes",
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("lang", sa.String(length=5), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"], ["org_organizations.id"], name=op.f("fk_org_codes_org_id_org_organizations"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_org_codes")),
        sa.UniqueConstraint("org_id", "lang", name=op.f("uq_org_codes_org_id")),
    )
    op.create_index(op.f("ix_org_codes_org_id"), "org_codes", ["org_id"], unique=False)
    op.create_table(
        "org_members",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=12), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"], ["org_organizations.id"], name=op.f("fk_org_members_org_id_org_organizations"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_org_members_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_org_members")),
    )
    op.create_index(op.f("ix_org_members_org_id"), "org_members", ["org_id"], unique=False)
    op.create_table(
        "org_links",
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("install_id", sa.String(length=64), nullable=False),
        sa.Column("lang", sa.String(length=5), nullable=False),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"], ["org_organizations.id"], name=op.f("fk_org_links_org_id_org_organizations"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_org_links")),
        sa.UniqueConstraint("install_id", name=op.f("uq_org_links_install_id")),
    )
    op.create_index(op.f("ix_org_links_org_id"), "org_links", ["org_id"], unique=False)
    op.create_table(
        "org_link_statuses",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("link_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["link_id"], ["org_links.id"], name=op.f("fk_org_link_statuses_link_id_org_links"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_org_link_statuses")),
    )
    op.create_index(op.f("ix_org_link_statuses_link_id"), "org_link_statuses", ["link_id"], unique=False)
    op.create_table(
        "org_daily_snapshots",
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("figures", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"], ["org_organizations.id"], name=op.f("fk_org_daily_snapshots_org_id_org_organizations"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("org_id", "day", name=op.f("pk_org_daily_snapshots")),
    )
    op.add_column("invites", sa.Column("org_id", sa.UUID(), nullable=True))
    op.add_column("invites", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_invites_org_id"), "invites", ["org_id"], unique=False)
    op.add_column("cmp_mentor_profiles", sa.Column("rules_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cmp_mentor_profiles", sa.Column("suspended", sa.Boolean(), server_default="false", nullable=False))
    op.create_table(
        "cmp_mentor_ended",
        sa.Column("learner_id", sa.UUID(), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["learner_id"], ["users.id"], name=op.f("fk_cmp_mentor_ended_learner_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("learner_id", name=op.f("pk_cmp_mentor_ended")),
    )


def downgrade() -> None:
    op.drop_table("cmp_mentor_ended")
    op.drop_column("cmp_mentor_profiles", "suspended")
    op.drop_column("cmp_mentor_profiles", "rules_accepted_at")
    op.drop_index(op.f("ix_invites_org_id"), table_name="invites")
    op.drop_column("invites", "expires_at")
    op.drop_column("invites", "org_id")
    op.drop_table("org_daily_snapshots")
    op.drop_index(op.f("ix_org_link_statuses_link_id"), table_name="org_link_statuses")
    op.drop_table("org_link_statuses")
    op.drop_index(op.f("ix_org_links_org_id"), table_name="org_links")
    op.drop_table("org_links")
    op.drop_index(op.f("ix_org_members_org_id"), table_name="org_members")
    op.drop_table("org_members")
    op.drop_index(op.f("ix_org_codes_org_id"), table_name="org_codes")
    op.drop_table("org_codes")
    op.drop_table("org_organizations")
