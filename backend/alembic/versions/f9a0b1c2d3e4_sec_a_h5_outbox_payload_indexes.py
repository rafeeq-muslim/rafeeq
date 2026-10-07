"""sec a-h5: indexes for the outbox lookups by device and by account.

Opt-out, account deletion and the mentor-contact check find outbox rows by
`payload->>'install_id'` / `payload->>'user_id'` (account deletion also by
`payload->>'mentor_id'`); with only the index on `name` each was a scan of
the whole table. Additive only: three expression indexes, no table or column
change, so the previous image keeps running.

Revises b8c9d0e1f2a3 (sec-auth-config-hardening), the only head on
origin/main when this branch merged main. A branch that merges later
re-points its own `down_revision` to the head then on main (one line).

Revision ID: f9a0b1c2d3e4
Revises: b8c9d0e1f2a3
Create Date: 2026-10-07 00:10:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f9a0b1c2d3e4"
down_revision: str | Sequence[str] | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_outbox_payload_install_id", "outbox", [sa.text("(payload ->> 'install_id')")])
    op.create_index("ix_outbox_payload_user_id", "outbox", [sa.text("(payload ->> 'user_id')")])
    op.create_index("ix_outbox_payload_mentor_id", "outbox", [sa.text("(payload ->> 'mentor_id')")])


def downgrade() -> None:
    op.drop_index("ix_outbox_payload_mentor_id", table_name="outbox")
    op.drop_index("ix_outbox_payload_user_id", table_name="outbox")
    op.drop_index("ix_outbox_payload_install_id", table_name="outbox")
