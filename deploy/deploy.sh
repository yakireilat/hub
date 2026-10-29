#!/usr/bin/env bash
# Runs on core-01 in /mesh/data/hub, called by the Deploy workflow with the new image.
# Backs up data, starts the new image, waits for it to be healthy, and rolls back if it isn't.
set -euo pipefail
cd "$(dirname "$0")"

new=$1
prev=$(cat .image 2>/dev/null || true)

mkdir -p data backups ntfy
# ponytail: tar of live SQLite files; switch to `sqlite3 .backup` once the worker writes often.
tar -czf "backups/data-$(date +%Y%m%d-%H%M%S).tgz" data ntfy
ls -1t backups/*.tgz | tail -n +11 | xargs -r rm --

up() { HUB_IMAGE=$1 docker compose up -d --wait --wait-timeout 120; }

# Push to the "hub" topic when .env has NTFY_TOKEN; never fails the deploy.
notify() {
  local token
  token=$(sed -n 's/^NTFY_TOKEN=//p' .env 2>/dev/null || true)
  [ -n "$token" ] || return 0
  docker exec ntfy wget -q -O /dev/null --header "Authorization: Bearer $token" \
    --header "Title: $1" --header "Tags: $2" --post-data "$3" http://127.0.0.1:8080/hub || true
}

if up "$new"; then
  echo "$new" > .image
  echo "deployed $new"
  notify "Hub deployed" "rocket" "${new##*:}"
  exit 0
fi

echo "hub-web did not become healthy on $new" >&2
HUB_IMAGE=$new docker compose logs --tail 50 hub-web >&2 || true
if [ -n "$prev" ]; then
  up "$prev" && echo "rolled back to $prev" >&2
fi
notify "Hub deploy failed" "rotating_light" "${new##*:} unhealthy, rolled back to ${prev##*:}"
exit 1
