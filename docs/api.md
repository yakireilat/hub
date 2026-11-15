# Hub API for system users

Scripts, Home Assistant, n8n and agents reach the hub at `https://hub-api.mesh.net` with a token.
People keep using `https://hub.mesh.net` through Authelia, as before.

## Tokens

Create one in **Settings → API → New token** (or ⌘K, "Create an API token"). Give it:

- a **name**: who uses it. It shows up in the audit log.
- **scopes**: what it may do, one per area, e.g. `services:read`, `calendar:write`. Pick the fewest that work.
- an **expiry**: 30 days, 90 days, 1 year, or never.

The token (`hub_<id>_<secret>`) is shown once. The hub stores only a SHA-256 hash of the secret.
Revoke it from the same screen; calls with it then get 401. A token can never create, list or revoke tokens,
read the audit log, or connect Google: those need a person.

## Calling

```bash
curl -H "Authorization: Bearer $HUB_TOKEN" https://hub-api.mesh.net/api/v1/services
```

- 401: no token, or an unknown, revoked or expired one.
- 403: the token lacks the endpoint's scope, or the endpoint is for people only.

The full list, with the scope each endpoint needs, is in Settings → API and at `/api/v1/openapi.json`
(any valid token may read it).

## Audit log

Every call made with a token is logged with its time, token, method, path, the scope it needed, and the
result: allowed with its HTTP status, or why it was refused. It's kept for `api.audit_days` (hub.yaml,
default 90).

## Setting up hub-api.mesh.net (once, on core-01)

1. Add `deploy/nginx/hub-api.mesh.net.conf` to `/mesh/configs/nginx.conf`, inside `http {}` and before the
   catch-all server. It has no Authelia; it lets through only `/api/v1/` requests with a `Bearer hub_` header,
   rate-limits them, and marks them with `X-Hub-Via: api` so the hub always asks them for a token.
2. Point `hub-api.mesh.net` at core-01 in DNS, like the other `*.mesh.net` names (skip if there's a wildcard).
3. `docker exec nginx nginx -t`, then `docker exec nginx nginx -s reload`.
