"""cmp-01..06 rewrite (PR #21): scholar referrals (CMP-02 R5) and the
requester's gender on help requests (CMP-01 R3).

Additive only, so the previous image still runs on this schema: the
requester's gender stays in the existing `prefer_gender` column (the model
calls it `requester_gender`); account requests made before the rule take the
account's gender where it is known. The report reason «خطر على أحد»
(CMP-04 R3) needs no schema change (`priority = 'danger'` fits String(6)).

Revision ID: a6b7c8d9e0f1
Revises: ef83fa7deee6
Create Date: 2026-10-06 21:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: str | Sequence[str] | None = "ef83fa7deee6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "cmp_scholar_referrals",
        sa.Column("request_id", UUID, nullable=False),
        sa.Column("message_id", UUID, nullable=False),
        sa.Column("lang", sa.String(length=5), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("referred_by", UUID, nullable=True),
        sa.Column("answered_by", UUID, nullable=True),
        sa.Column("answer_id", UUID, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", UUID, nullable=False),
        sa.ForeignKeyConstraint(
            ["request_id"], ["cmp_help_requests.id"], name=op.f("fk_cmp_scholar_referrals_request_id_cmp_help_requests"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["message_id"], ["cmp_help_messages.id"], name=op.f("fk_cmp_scholar_referrals_message_id_cmp_help_messages"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["answer_id"], ["cmp_help_messages.id"], name=op.f("fk_cmp_scholar_referrals_answer_id_cmp_help_messages"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["referred_by"], ["users.id"], name=op.f("fk_cmp_scholar_referrals_referred_by_users"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["answered_by"], ["users.id"], name=op.f("fk_cmp_scholar_referrals_answered_by_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cmp_scholar_referrals")),
        sa.UniqueConstraint("message_id", name=op.f("uq_cmp_scholar_referrals_message_id")),
    )
    op.create_index(op.f("ix_cmp_scholar_referrals_request_id"), "cmp_scholar_referrals", ["request_id"], unique=False)
    # CMP-01 R3: requests from accounts whose gender is known take it now.
    op.execute(
        "UPDATE cmp_help_requests r SET prefer_gender = u.gender FROM users u "
        "WHERE r.learner_id = u.id AND u.gender IS NOT NULL AND r.kind <> 'urgent'"
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_cmp_scholar_referrals_request_id"), table_name="cmp_scholar_referrals")
    op.drop_table("cmp_scholar_referrals")
