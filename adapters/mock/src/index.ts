import type { Adapter, Item } from "@hub/core";

/**
 * Phase 1 stand-ins for the real adapters. Same contract, in-memory state, times relative to
 * `now` so Today always looks like today. Acting on an item changes what the next read returns.
 */
export function createMockAdapters(now: () => Date = () => new Date()): Adapter[] {
  const at = (h: number, m = 0) => {
    const d = new Date(now());
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const state = { backupFailed: true, inviteAnswer: undefined as undefined | "accepted" | "declined" };

  const calendar: Adapter = {
    id: "calendar",
    name: "Google Calendar",
    async read() {
      const events: Item[] = [
        ev("standup", "Standup", "Work · 15 min", at(9, 30), "info"),
        ev("review", "Review hub phase 3 PR", "Home server · 1 h", at(11), "up"),
        ev("lunch", "Lunch", "1 h", at(13), "idle"),
        ev("study", "Study block", "Study · 2 h", at(19, 30), "info"),
      ];
      const invite: Item = {
        ...ev("dentist", "Dentist check-up", "Today 16:00 · 45 min", at(16), "info"),
        kind: state.inviteAnswer === "accepted" ? "event" : "invite",
        statusLabel: state.inviteAnswer ? undefined : "Invite",
        route: state.inviteAnswer ? "fyi" : "needs_action",
        actions: state.inviteAnswer
          ? []
          : [
              { id: "accept", label: "Accept", primary: true },
              { id: "decline", label: "Decline" },
            ],
      };
      return state.inviteAnswer === "declined" ? events : [...events, invite];
    },
    async act(itemId, actionId) {
      if (actionId === "new") return { ok: true, message: "The new-event form arrives with the calendar in phase 5" };
      if (itemId !== "calendar:dentist") return { ok: false, message: "Unknown event" };
      if (actionId !== "accept" && actionId !== "decline") return { ok: false, message: "Unknown action" };
      state.inviteAnswer = actionId === "accept" ? "accepted" : "declined";
      return { ok: true, message: actionId === "accept" ? "Invite accepted" : "Invite declined" };
    },
    link: (item) => item.href,
    commands: () => [
      { id: "calendar:new", label: "New event", keywords: ["create", "meeting"], scope: "action", action: { actionId: "new" } },
    ],
  };

  const n8n: Adapter = {
    id: "n8n",
    name: "n8n",
    async read() {
      return [
        {
          id: "n8n:backup",
          source: "n8n",
          kind: "run",
          title: "Nightly backup → B2",
          context: state.backupFailed ? 'Step "Upload" timed out' : "Retried · finished in 4 min",
          time: at(3, 12),
          status: state.backupFailed ? "failed" : "up",
          route: state.backupFailed ? "needs_action" : "fyi",
          actions: state.backupFailed
            ? [
                { id: "retry", label: "Retry", primary: true },
                { id: "open", label: "Open run" },
              ]
            : [],
          href: "https://n8n.mesh.net/workflow/backup/executions",
        },
        {
          id: "n8n:ok",
          source: "n8n",
          kind: "run",
          title: "Workflow runs",
          context: "Grouped · since midnight",
          time: at(10, 40),
          status: "up",
          statusLabel: "23 succeeded",
          route: "fyi",
          actions: [],
          href: "https://n8n.mesh.net/executions",
          meta: { count: 23 },
        },
      ];
    },
    async act(itemId, actionId) {
      if (itemId === "n8n:backup" && actionId === "retry") {
        state.backupFailed = false;
        return { ok: true, message: "Backup retried" };
      }
      if (actionId === "backup-now") return { ok: true, message: "Started “Backup now”" };
      if (actionId === "log-expense") return { ok: true, message: "The expense form arrives with action buttons in phase 4" };
      return { ok: false, message: "Unknown action" };
    },
    link: (item) => item.href,
    commands: () => [
      { id: "n8n:backup-now", label: "Run “Backup now”", keywords: ["backup", "restic"], scope: "action", action: { actionId: "backup-now" } },
      { id: "n8n:log-expense", label: "Log an expense", keywords: ["money", "budget"], scope: "action", action: { actionId: "log-expense" } },
    ],
  };

  const checks: Adapter = {
    id: "checks",
    name: "Checks",
    async read() {
      const svc = (name: string, ms: number, slow = false): Item => ({
        id: `checks:${name.toLowerCase().replace(/\W+/g, "-")}`,
        source: "checks",
        kind: "service",
        title: name,
        context: `core-01 · ${ms.toLocaleString("en")} ms`,
        time: at(10, 41),
        status: slow ? "slow" : "up",
        route: "fyi",
        actions: [],
        href: `https://${name.toLowerCase().replace(/\W+/g, "")}.mesh.net`,
        meta: { ms },
      });
      return [svc("n8n", 84), svc("Jellyfin", 2410, true), svc("Gitea", 140), svc("Pi-hole", 9), svc("Vaultwarden", 31)];
    },
    async act() {
      return { ok: false, message: "Checks have no actions" };
    },
    link: (item) => item.href,
  };

  const vault: Adapter = {
    id: "vault",
    name: "Vault",
    async read() {
      const note = (slug: string, title: string, context: string, time: string): Item => ({
        id: `vault:${slug}`,
        source: "vault",
        kind: "note",
        title,
        context,
        time,
        status: "idle",
        route: "fyi",
        actions: [],
        href: `obsidian://open?vault=mesh&file=${encodeURIComponent(title)}`,
      });
      return [
        note("hub-open-questions", "Hub — open questions", "Docs/ · edited 22 min ago", at(10, 20)),
        note("daily", "Daily note", "3 captures", at(9, 45)),
        note("authelia", "Authelia 4.39 upgrade", "Home server", at(8, 0)),
        note("backups", "Backups — restic + Backrest setup", "Home server", at(7, 0)),
      ];
    },
    async act() {
      return { ok: false, message: "Notes are edited in Obsidian" };
    },
    link: (item) => item.href,
  };

  return [calendar, n8n, checks, vault];

  function ev(slug: string, title: string, context: string, time: string, status: Item["status"]): Item {
    return {
      id: `calendar:${slug}`,
      source: "calendar",
      kind: "event",
      title,
      context,
      time,
      status,
      route: "fyi",
      actions: [],
      href: "https://calendar.google.com/calendar/r/day",
    };
  }
}
