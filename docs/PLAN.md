# Hub — plan (condensed)

Source of truth: the "Hub — architecture & Claude Code build plan" doc. This file is the
condensed brief Claude Code works from.

## What it is
One thin web app, the front door of the Mesh. It runs on **core-01** (NanoPi R5C, ARM64, 4 GB RAM,
SSD) at `https://hub.mesh.net`, reachable only over the tailnet, and replaces **NP Monitor** and
**Uptime Kuma**. Proven tools do the real work behind it: Google Calendar, n8n, an Obsidian vault
(Self-hosted LiveSync), ntfy, and the services already running on the nodes. The hub owns layout,
search, inbox, customization and an API for system users; it never re-implements those tools.

## Stack
| Layer | Pick |
| --- | --- |
| Host | core-01, Docker Compose, every image `linux/arm64` |
| Access | Tailscale (tailnet `mesh.nexora`) + existing nginx; split DNS `mesh.net` → Pi-hole |
| HTTPS | Own internal CA wildcard `*.mesh.net`, fully trusted on every device |
| Sign-in, people | Authelia v4.39+ (passkeys) as OIDC provider |
| Sign-in, systems | Hub API tokens: scoped, expiring, hashed, audited |
| App | Next.js + TypeScript + Tailwind + cmdk + react-grid-layout + TanStack Query |
| Data | SQLite + Drizzle + FTS5, on the SSD under `/opt/hub` |
| Images | Built on GitHub `ubuntu-24.04-arm` runners, pushed to GHCR |
| Deploy | Actions joins tailnet as `tag:ci`, SSH to core-01, backup db, compose up, health check, rollback |
| Calendar | Google Calendar, polled every 2 min with sync tokens (OAuth app published to Production) |
| Automations | n8n (existing) |
| Notes | Obsidian + LiveSync → CouchDB on core-01; livesync-bridge mirrors to a plain folder |
| Notifications | ntfy, iOS push via upstream `https://ntfy.sh` |
| Health | Built-in checks + Netdata + Tailscale API (OAuth client) |

New containers on core-01: `hub-web`, `hub-worker`, `ntfy`, `couchdb`, `livesync-bridge`, each with
`mem_limit`. Heavy services (Immich, Paperless-ngx, Home Assistant, Ollama) live on eilatlab or Niflheim.

## Adapter contract
Every system plugs in through one adapter with four parts: **read** (pull items), **act** (do
something), **listen** (receive events), **link** (deep-link into the real app). The UI only talks
to adapters through `packages/core`. Every record is an **Item**: icon, title, one context line,
time, status, up to two actions, and an "Open in source" link.

## UX rules
1. Answer "what needs me?" first — Today opens with a verdict line and Needs attention.
2. Act in place; "Open in source" is the fallback.
3. One keyboard door: ⌘K searches and runs. Prefixes `>` actions, `#` notes/docs, `@` calendar, `/` services.
4. Quiet by default; only rules make something Needs action or push to the phone.
5. Same item, same shape.
6. Never colour alone: ● up, ▲ slow, ■ failed (shape + word).
7. Customizing is a mode.
8. Capture is one keystroke away (`c`).
9. Mobile is a companion: Today, Calendar, Inbox, Runs, capture.
10. Comfortable defaults, full control.

Two-key shortcuts: `g t` Today, `g c` Calendar, `g i` Inbox, `g a` Automations, `g n` Notes,
`g s` Services, `g d` Docs.

Design tokens: ground `#0D0E11`, accent amber `#F0B44C`, Geist + Geist Mono.

## Build phases
| # | Phase | You get |
| --- | --- | --- |
| 0 | Inventory (read-only) | `docs/INVENTORY.md` of core-01 |
| 1 | Shell and design system | Rail, top bar, ⌘K palette, Today with mock data, tokens, light/dark |
| 2 | First deploy | hub.mesh.net behind Authelia, ntfy push, deploy on merge |
| 3 | Services, uptime, nodes | Checks, history, Netdata tiles, Tailscale state, migrated monitors |
| 4 | Automations + Inbox | n8n runs, Retry/Run, action buttons, inbox fed by ntfy |
| 5 | Calendar | Live agenda, create events, answer invites |
| 6 | Notes and search | CouchDB + bridge, recent notes, capture, one search |
| 7 | API and system users | Tokens, scopes, audit, REST + SSE + webhooks + MCP |
| 8 | Customize, mobile, cutover | Spaces, widgets, PWA; old dashboards stopped |
| 9+ | Waves 2 and 3 | The rest of the service catalog |
