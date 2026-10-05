#!/usr/bin/env bash
# Build, start, health-check; roll back to the previous images on failure.
set -euo pipefail
cd "$(dirname "$0")/../.."
SECRETS=/home/naser/.config/rafeeq/secrets.env
FONTS=/home/naser/.config/rafeeq/fonts/thmanyah
COMPOSE="docker compose -p rafeeq -f infra/compose.prod.yml"

# Thmanyah may be bundled in our app but never committed (licence).
if [ -d "$FONTS" ]; then mkdir -p frontend/public/fonts && cp -r "$FONTS" frontend/public/fonts/; fi
export VITE_VAPID_PUBLIC_KEY="$(grep '^VAPID_PUBLIC_KEY=' "$SECRETS" | cut -d= -f2-)"
export VITE_BUILD_ID="$(git rev-parse --short HEAD)"

for img in rafeeq-backend rafeeq-web; do
  docker image inspect "$img:latest" >/dev/null 2>&1 && docker tag "$img:latest" "$img:previous" || true
done

$COMPOSE build
$COMPOSE up -d --remove-orphans

for i in $(seq 1 60); do
  if curl -fsS -m 4 http://127.0.0.1:5380/api/health >/dev/null; then
    echo "healthy after ${i} checks ($(git rev-parse --short HEAD))"
    docker image prune -f >/dev/null
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
