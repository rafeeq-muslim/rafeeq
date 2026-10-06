"""mot-06 r3: the reviewer's reason when returning a mentor's free-text challenge.

Additive only: a nullable text column, so the previous image still runs on
this schema. Shown to the group's mentor only, never to members.

Revision ID: c3d4e5f6a7b8
Revises: 2b3c4d5e6f7a (cmp-05-r5-removed-rejoin, PR #66, itself on 1a9e0d5c3b7f; merge #66 first)
Create Date: 2026-10-06 21:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "2b3c4d5e6f7a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("mot_challenges", sa.Column("review_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("mot_challenges", "review_note")
