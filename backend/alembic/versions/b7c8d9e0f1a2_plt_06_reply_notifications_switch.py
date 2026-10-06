"""plt-06 r1/r2: replies have their own switch on the push subscription.

Additive only, so the previous image still runs on this schema: the new
column has a server default (off), which is what a new subscription gets
(PLT-06 R1: nothing until the person turns it on). Subscriptions that exist
already were made by a person who turned notifications on and have been
receiving replies since; they keep receiving them (switch shown on, and they
can turn it off), so nobody silently stops getting a reply they relied on.

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-10-06 23:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | Sequence[str] | None = "a6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "push_subscriptions",
        sa.Column("replies_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute("UPDATE push_subscriptions SET replies_enabled = true")


def downgrade() -> None:
    op.drop_column("push_subscriptions", "replies_enabled")
