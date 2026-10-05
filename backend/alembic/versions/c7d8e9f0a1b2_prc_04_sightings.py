"""prc-04: moon-sighting announcements (prc_sightings)

Revision ID: c7d8e9f0a1b2
Revises: b3c1d2e4f5a6
Create Date: 2026-10-05 23:30:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: str | Sequence[str] | None = "b3c1d2e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "prc_sightings",
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("hijri_year", sa.Integer(), nullable=False),
        sa.Column("hijri_month", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("source_url", sa.String(length=400), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_prc_sightings")),
        sa.UniqueConstraint("country", "hijri_year", "hijri_month", name=op.f("uq_prc_sightings_country")),
    )


def downgrade() -> None:
    op.drop_table("prc_sightings")
