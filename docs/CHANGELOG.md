# Changelog

- Repo bootstrap: CLAUDE.md, docs/PLAN.md.
- Phase 1: pnpm monorepo, tokens (dark/light), core (Item, adapter contract, hub.yaml schema, inbox rules), mock adapters, app shell with rail, ⌘K palette, g-shortcuts, capture and Today; unit + Playwright tests.
- Data flows through a HubClient: /api/v1 endpoints in server mode, an in-browser mock hub for the static demo; CI and a GitHub Pages demo workflow.
- Phase 0: docs/INVENTORY.md of core-01; plan corrected to x86_64 and /mesh/data/hub.
- Deploy workflow: amd64 image to GHCR, then compose up in /mesh/data/hub on core-01 over the tailnet, with backup, health check and rollback.
- hub-web deployed by hand to /mesh/data/hub; hub.mesh.net nginx block behind Authelia (deploy/nginx).
- ntfy on core-01 (ntfy.mesh.net, token auth, iOS via ntfy.sh upstream); deploy.sh pushes deploy results to the hub topic.
- Phase 3a: checks adapter (HTTP checks of hub.yaml services, up/slow/failed), Services screen grouped by node, core-01 hub.yaml.
- Services: edit mode to add (smart detection of the app, health check and node), edit and remove services, stored in hub.db over hub.yaml; checks every minute with a 24 h uptime strip and 24 h / 7 d uptime per service.
- Deploy workflow: SSH key and known-hosts secrets are optional; without them the runner reaches core-01 through Tailscale SSH (tag:ci → tag:hub).
- Services: each row shows how long a service has been up, slow or down ("up 3 d") instead of the shared check time, which now appears once in the header.
- Notifications: ntfy retired; deploy results (and later inbox alerts) go out as Gmail through an n8n webhook. The ntfy container is removed on deploy; its data folder stays for rollback.
- Services: node tiles with online / last seen from the Tailscale API and CPU, RAM, disk and temperature from Prometheus node-exporter (nodes matched by hostname).
