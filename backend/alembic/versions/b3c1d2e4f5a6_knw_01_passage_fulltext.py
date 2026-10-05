"""knw-01: full-text column on passages for hybrid retrieval

Revision ID: b3c1d2e4f5a6
Revises: 4206e7276135
Create Date: 2026-10-05 22:00:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "b3c1d2e4f5a6"
down_revision: str | Sequence[str] | None = "4206e7276135"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TSV_SQL = (
    "to_tsvector(CASE WHEN lang = 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END, "
    "translate(regexp_replace(left(quote_text || ' ' || coalesce(context_text, ''), 20000), "
    "'[\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640]', '', 'g'), "
    "'أإآٱىةؤئ', 'اااايهوي'))"
)


def upgrade() -> None:
    op.execute("SET LOCAL statement_timeout = 0")
    op.execute(f"ALTER TABLE knw_passages ADD COLUMN tsv tsvector GENERATED ALWAYS AS ({TSV_SQL}) STORED")
    op.execute("CREATE INDEX ix_knw_passages_tsv ON knw_passages USING gin (tsv)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_knw_passages_tsv")
    op.execute("ALTER TABLE knw_passages DROP COLUMN IF EXISTS tsv")
