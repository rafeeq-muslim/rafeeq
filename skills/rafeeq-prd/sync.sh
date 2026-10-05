#!/usr/bin/env bash
# Copy the repo's docs/ into the skill's references/ so the skill carries the
# current system. Run from anywhere before packaging or committing the skill.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
rm -rf "$here/references"
mkdir -p "$here/references"
cp -r "$repo/docs/." "$here/references/"
# Source books are git-ignored and never part of the skill.
rm -rf "$here/references/domains/learning/learning sources"
echo "Synced docs/ into $here/references"
