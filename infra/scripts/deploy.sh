#!/usr/bin/env bash
# Build, start, health-check; roll back to the previous images on failure.
set -euo pipefail
cd "$(dirname "$0")/../.."
SECRETS=/home/naser/.config/rafeeq/secrets.env
FONTS=/home/naser/.config/rafeeq/fonts/thmanyah
COMPOSE="docker compose -p rafeeq -f infra/compose.prod.yml"

# The database container gets only its own settings, not the whole secrets
# file: db.env holds the POSTGRES_* lines, rewritten on every deploy (mode
# 600) before any compose command reads it. Unchanged content does not
# recreate the container.
DB_ENV="$(dirname "$SECRETS")/db.env"
write_db_env() {
  local tmp
  tmp="$(umask 077 && mktemp "$DB_ENV.XXXXXX")"
  grep '^POSTGRES_' "$SECRETS" > "$tmp" || true
  if ! grep -q '^POSTGRES_PASSWORD=.' "$tmp"; then
    rm -f "$tmp"
    echo "POSTGRES_PASSWORD is missing from the secrets file; nothing was changed" >&2
    exit 1
  fi
  chmod 600 "$tmp" && mv -f "$tmp" "$DB_ENV"
}
write_db_env

# Thmanyah may be bundled in our app but never committed (licence).
if [ -d "$FONTS" ]; then mkdir -p frontend/public/fonts && cp -r "$FONTS" frontend/public/fonts/; fi
export VITE_VAPID_PUBLIC_KEY="$(grep '^VAPID_PUBLIC_KEY=' "$SECRETS" | cut -d= -f2-)"
export VITE_BUILD_ID="$(git rev-parse --short HEAD)"

# KNW-02: reload the approved-source corpus only when its files changed.
CORPUS=/home/naser/.local/share/rafeeq/corpus
STAMP=/home/naser/.config/rafeeq/corpus.sha
load_corpus() {
  [ -d "$CORPUS" ] || return 0
  local sum
  sum="$(cd "$CORPUS" && ls -l --time-style=+%s *.jsonl 2>/dev/null | sha256sum | cut -d' ' -f1)"
  [ "$sum" = "$(cat "$STAMP" 2>/dev/null)" ] && { echo "corpus unchanged"; return 0; }
  echo "loading corpus"
  $COMPOSE exec -T backend sh -c 'export DATABASE_URL=postgresql+asyncpg://rafeeq:${POSTGRES_PASSWORD}@db:5432/rafeeq && python -m app.knowledge.load' \
    && echo "$sum" > "$STAMP" || echo "corpus load failed (app keeps the previous corpus)" >&2
}

for img in rafeeq-backend rafeeq-web; do
  docker image inspect "$img:latest" >/dev/null 2>&1 && docker tag "$img:latest" "$img:previous" || true
done

$COMPOSE build

# Migrate before switching, with no time limit: a long migration (e.g. an
# index over the whole corpus) must never trip the health check, and a
# failed migration must leave the running version untouched. Migrations are
# additive (expand only), so the previous image still runs on the new schema.
$COMPOSE up -d db
$COMPOSE run --rm --no-deps backend sh -c 'export DATABASE_URL=postgresql+asyncpg://rafeeq:${POSTGRES_PASSWORD}@db:5432/rafeeq && alembic upgrade head'

$COMPOSE up -d --remove-orphans

for i in $(seq 1 60); do
  if curl -fsS -m 4 http://127.0.0.1:5380/api/health >/dev/null; then
    echo "healthy after ${i} checks ($(git rev-parse --short HEAD))"
    docker image prune -f >/dev/null
    load_corpus
    exit 0
  fi
  sleep 3
done

echo "health check failed; rolling back" >&2
$COMPOSE logs --tail=80 backend >&2 || true
for img in rafeeq-backend rafeeq-web; do
  docker image inspect "$img:previous" >/dev/null 2>&1 && docker tag "$img:previous" "$img:latest" || true
done
$COMPOSE up -d --no-build
exit 1
