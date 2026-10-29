# Hub — rules for Claude Code

## What this is
The front door of the Mesh homelab: one UI over Google Calendar, n8n, an Obsidian vault (LiveSync),
ntfy and the services on the Mesh nodes. It runs on core-01 (NanoPi R5C, Armbian, ARM64, 4 GB RAM)
at https://hub.mesh.net, reachable only over the tailnet. It replaces NP Monitor and Uptime Kuma.
The hub never re-implements those apps. It reads, acts, listens and deep-links through adapters.
The full plan is docs/PLAN.md.

## Non-negotiables
- Every image is linux/arm64. Keep the hub-web + hub-worker under ~400 MB RAM together.
- Every container in deploy/ sets mem_limit. Data volumes live under /opt/hub on the SSD.
- Migrations are additive only (no drop or rename in the release that stops using it),
  so rolling back to the previous image is always safe.
- core-01 is shared: never stop, restart or edit containers or configs the hub doesn't own
  without asking. Changes to nginx and Authelia are snippets in deploy/ that I apply.
- UI talks only to adapters via packages/core; never call a service API from a component.
- Every visible record renders through components/item/Item.
- Status = shape + word, never colour alone. Touch targets >= 44px. Keyboard reachable.
- Every button action is also a command-palette command and an API endpoint.
- Colours, type and spacing come from packages/tokens only.
- Secrets come from env vars; document each in .env.example.
- New settings go into the hub.yaml zod schema with a default.

## Workflow
- Small PRs, one feature each. Run `pnpm lint && pnpm typecheck && pnpm test` before committing.
- Add or update a Playwright test for any screen you change (`pnpm e2e`).
- One line per PR in docs/CHANGELOG.md.
