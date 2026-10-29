#!/usr/bin/env bash
# Runs on core-01 in /mesh/data/hub, called by the Deploy workflow with the new image.
# Backs up data, starts the new image, waits for it to be healthy, and rolls back if it isn't.
set -euo pipefail
cd "$(dirname "$0")"

new=$1
prev=$(cat .image 2>/dev/null || true)

mkdir -p data backups
if [ -n "$(ls -A data)" ]; then
  # ponytail: tar of a live SQLite file; switch to `sqlite3 .backup` once the worker writes often.
  tar -czf "backups/data-$(date +%Y%m%d-%H%M%S).tgz" data
  ls -1t backups/*.tgz | tail -n +11 | xargs -r rm --
fi

up() { HUB_IMAGE=$1 docker compose up -d --wait --wait-timeout 120; }

if up "$new"; then
  echo "$new" > .image
  echo "deployed $new"
  exit 0
fi

echo "hub-web did not become healthy on $new" >&2
HUB_IMAGE=$new docker compose logs --tail 50 hub-web >&2 || true
if [ -n "$prev" ]; then
  up "$prev" && echo "rolled back to $prev" >&2
fi
exit 1
