#!/usr/bin/env bash
# Weekly islamqa.info refresh (owner decision 2026-10-06: islamqa is a main
# source). islamqa's own "go offline" feature publishes full per-language
# dumps listed in a manifest; when it lists a newer Arabic or English dump
# than the one we hold, download it, normalize it to the corpus, and load it
# into production. The loader replaces the source in one transaction and
# refuses a missing, empty or unexpectedly shrunken file (KNW-02 SC2), so a
# bad download never wipes the current passages. New passages are embedded
# by the backend's scheduled job.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RAW="$HOME/.local/share/rafeeq/sources/islamqa"
CORPUS="$HOME/.local/share/rafeeq/corpus"
STAMP="$HOME/.config/rafeeq/corpus.sha"
MANIFEST_URL="https://files.zadapps.info/m.islamqa.info/dumps/manifest.json"
COMPOSE="docker compose -p rafeeq -f $REPO/infra/compose.prod.yml"

folders() { python3 -c 'import json,sys; d=json.load(sys.stdin); print(" ".join(sorted(x["folder"] for x in d["dumps"] if x["lang"] in ("ar","en"))))'; }

remote="$(curl -fsS --max-time 60 "$MANIFEST_URL" | folders)"
local_="$(folders < "$RAW/manifest.json" 2>/dev/null || true)"
if [ -z "$remote" ]; then echo "manifest unreadable; nothing changed" >&2; exit 1; fi
if [ "$remote" = "$local_" ]; then echo "islamqa unchanged ($remote)"; exit 0; fi

echo "new islamqa dump: $remote (had: ${local_:-none})"
cd "$REPO/backend"
uv run python -m app.knowledge.sources.islamqa --fetch   # downloads, then writes $CORPUS/islamqa.jsonl
$COMPOSE exec -T backend sh -c 'export DATABASE_URL=postgresql+asyncpg://rafeeq:${POSTGRES_PASSWORD}@db:5432/rafeeq && python -m app.knowledge.load islamqa'
# Keep deploy.sh from reloading the unchanged corpus on the next deploy.
(cd "$CORPUS" && ls -l --time-style=+%s *.jsonl | sha256sum | cut -d' ' -f1) > "$STAMP"
echo "islamqa refreshed and loaded"
