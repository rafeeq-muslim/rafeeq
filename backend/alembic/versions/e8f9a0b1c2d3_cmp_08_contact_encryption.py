"""cmp-08 r3: the mentor applicant's contact is encrypted at rest.

Additive only: two nullable columns and one index, so the previous image
still runs on this schema (it keeps reading and writing the plain `contact`
column, which stays until a later release drops it).

No data is touched here on purpose: the encryption keys may not be set yet,
and a deploy must never fail for that. Existing plain contacts are encrypted
by the app once the keys exist (at start, daily, or
`python -m app.core.crypto migrate`: app/companion/applications.py
`encrypt_plaintext`), which empties `contact` row by row.

Downgrade drops the two columns: contacts already encrypted are lost with
them (decrypt them back first if that ever matters).

Revision ID: e8f9a0b1c2d3
Revises: a7b8c9d0e1f2 (plt-17 invite revoked_at)
Create Date: 2026-10-07 02:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: str | Sequence[str] | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cmp_mentor_applications", sa.Column("contact_enc", sa.Text(), nullable=True))
    op.add_column("cmp_mentor_applications", sa.Column("contact_hmac", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_cmp_mentor_applications_contact_hmac"), "cmp_mentor_applications", ["contact_hmac"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_cmp_mentor_applications_contact_hmac"), table_name="cmp_mentor_applications")
    op.drop_column("cmp_mentor_applications", "contact_hmac")
    op.drop_column("cmp_mentor_applications", "contact_enc")
