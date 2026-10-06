"""lrn-04 r2: the account copy keeps the exercises answered per objective.

Additive only: a nullable JSONB column, so the previous image still runs on
this schema. Review prefers an exercise the learner has not answered; with
this column that preference holds on every device of the account.

Revision ID: 1a9e0d5c3b7f
Revises: f7a8b9c0d1e2 (mot-audit-gaps, on ORG e5f6a7b8c9d0; merge order ORG, MOT, LRN)
Create Date: 2026-10-06 19:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "1a9e0d5c3b7f"
down_revision: str | Sequence[str] | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("lrn_objective_mastery", sa.Column("seen_exercises", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("lrn_objective_mastery", "seen_exercises")
