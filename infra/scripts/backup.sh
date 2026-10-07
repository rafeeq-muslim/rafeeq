#!/usr/bin/env bash
# Nightly database backup (plan §10): compressed pg_dump, newest 7 kept.
# Backups stay on this server, outside the repo; they contain user data.
set -euo pipefail
DIR="${RAFEEQ_BACKUP_DIR:-$HOME/backups/rafeeq}"
mkdir -p "$DIR" && chmod 700 "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose -p rafeeq -f "$(dirname "$0")/../compose.prod.yml" exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d rafeeq --format=custom --no-owner' > "$DIR/rafeeq-$STAMP.dump.tmp"
mv "$DIR/rafeeq-$STAMP.dump.tmp" "$DIR/rafeeq-$STAMP.dump"
chmod 600 "$DIR/rafeeq-$STAMP.dump"
ls -1t "$DIR"/rafeeq-*.dump | tail -n +8 | xargs -r rm -f
echo "backup ok: $DIR/rafeeq-$STAMP.dump"
