#!/usr/bin/env bash
# Build, start, health-check; roll back to the previous images on failure.
set -euo pipefail
cd "$(dirname "$0")/../.."
# Server paths come from the account that runs the deploy (the runner's user),
# never from a fixed home directory. compose.prod.yml reads the same two
# variables, so they are exported here for every compose call below.
export RAFEEQ_CONFIG_DIR="${RAFEEQ_CONFIG_DIR:-$HOME/.config/rafeeq}"
export RAFEEQ_CORPUS_DIR="${RAFEEQ_CORPUS_DIR:-$HOME/.local/share/rafeeq/corpus}"
SECRETS="$RAFEEQ_CONFIG_DIR/secrets.env"
FONTS="$RAFEEQ_CONFIG_DIR/fonts/thmanyah"
COMPOSE="docker compose -p rafeeq -f infra/compose.prod.yml"

# The database container gets only its own settings, not the whole secrets
# file: db.env holds the POSTGRES_* lines, rewritten on every deploy (mode
# 600) before any compose command reads it. Unchanged content does not
# recreate the container.
DB_ENV="$RAFEEQ_CONFIG_DIR/db.env"
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
CORPUS="$RAFEEQ_CORPUS_DIR"
STAMP="$RAFEEQ_CONFIG_DIR/corpus.sha"
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
# The Actions log of a public repo is public, and backend errors can carry
# personal data, so the backend's last lines go to a file only this account
# can read. The run shows where the file is, never what it holds.
FAIL_DIR="${RAFEEQ_STATE_DIR:-$HOME/.local/state/rafeeq}"
FAIL_LOG="$FAIL_DIR/deploy-fail-$(git rev-parse --short HEAD).log"
if (umask 077 && mkdir -p "$FAIL_DIR" && $COMPOSE logs --tail=80 backend > "$FAIL_LOG" 2>&1); then
  chmod 600 "$FAIL_LOG"
  echo "backend log saved on the server: ~${FAIL_LOG#"$HOME"}" >&2
else
  echo "backend log could not be saved on the server" >&2
fi
for img in rafeeq-backend rafeeq-web; do
  docker image inspect "$img:previous" >/dev/null 2>&1 && docker tag "$img:previous" "$img:latest" || true
done
$COMPOSE up -d --no-build
exit 1
