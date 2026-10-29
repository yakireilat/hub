# Changelog

- Repo bootstrap: CLAUDE.md, docs/PLAN.md.
- Phase 1: pnpm monorepo, tokens (dark/light), core (Item, adapter contract, hub.yaml schema, inbox rules), mock adapters, app shell with rail, ⌘K palette, g-shortcuts, capture and Today; unit + Playwright tests.
- Data flows through a HubClient: /api/v1 endpoints in server mode, an in-browser mock hub for the static demo; CI and a GitHub Pages demo workflow.
- Phase 0: docs/INVENTORY.md of core-01; plan corrected to x86_64 and /mesh/data/hub.
- Deploy workflow: amd64 image to GHCR, then compose up in /mesh/data/hub on core-01 over the tailnet, with backup, health check and rollback.
