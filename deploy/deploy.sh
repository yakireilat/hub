#!/usr/bin/env bash
# Runs on core-01 in /mesh/data/hub, called by the Deploy workflow with the new image.
# Backs up data, starts the new image, waits for it to be healthy, and rolls back if it isn't.
set -euo pipefail
cd "$(dirname "$0")"

new=$1
prev=$(cat .image 2>/dev/null || true)

mkdir -p data backups
# ponytail: tar of live SQLite files; switch to `sqlite3 .backup` once the worker writes often.
# ntfy/ is the retired ntfy's data, kept for a rollback; back it up while it is still there.
tar -czf "backups/data-$(date +%Y%m%d-%H%M%S).tgz" data $([ -d ntfy ] && echo ntfy)
ls -1t backups/*.tgz | tail -n +11 | xargs -r rm --

# --remove-orphans: containers this stack no longer defines (the old ntfy) are removed, nothing else.
up() { HUB_IMAGE=$1 docker compose up -d --wait --wait-timeout 120 --remove-orphans; }

# Email through n8n's "hub-notify" webhook (n8n sends it with its Gmail credential) when .env has
# HUB_NOTIFY_WEBHOOK. Sent from inside hub-web, which shares the mesh network with n8n. Never fails the deploy.
notify() {
  local url token
  url=$(sed -n 's/^HUB_NOTIFY_WEBHOOK=//p' .env 2>/dev/null || true)
  token=$(sed -n 's/^HUB_NOTIFY_TOKEN=//p' .env 2>/dev/null || true)
  [ -n "$url" ] || return 0
  # HOOK, not URL: a variable named URL would shadow the URL class that fetch itself needs.
  docker exec -e HOOK="$url" -e TOKEN="$token" -e TITLE="$1" -e LEVEL="$2" -e MESSAGE="$3" hub-web node -e '
    const { HOOK, TOKEN, TITLE, LEVEL, MESSAGE } = process.env;
    fetch(HOOK, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-token": TOKEN },
      body: JSON.stringify({ title: TITLE, level: LEVEL, message: MESSAGE, source: "deploy" }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1));
  ' || echo "notify: could not reach $url" >&2
}

if up "$new"; then
  echo "$new" > .image
  echo "deployed $new"
  notify "Hub deployed" "info" "${new##*:} is live on core-01."
  exit 0
fi

echo "hub-web did not become healthy on $new" >&2
HUB_IMAGE=$new docker compose logs --tail 50 hub-web >&2 || true
if [ -n "$prev" ]; then
  up "$prev" && echo "rolled back to $prev" >&2
fi
notify "Hub deploy failed" "error" "${new##*:} did not become healthy; rolled back to ${prev##*:}."
exit 1
