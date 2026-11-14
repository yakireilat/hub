import type { ActResult, Adapter, AutomationsPayload, Command, Item, RunView, WorkflowView } from "@hub/core";

interface Workflow {
  id: string;
  name: string;
  active: boolean;
}

interface Execution {
  id: string | number;
  workflowId: string;
  status?: string;
  finished?: boolean;
  startedAt: string;
  stoppedAt?: string | null;
  retryOf?: string | null;
  retrySuccessId?: string | null;
}

const DAY = 86_400_000;

/** The n8n public API (/api/v1) with an API key. Reads, retries and activation only. */
export function createN8nClient(opts: { url: string; apiKey: string; fetchFn?: typeof fetch }) {
  const fetchFn = opts.fetchFn ?? fetch;
  const base = `${opts.url.replace(/\/$/, "")}/api/v1`;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchFn(`${base}${path}`, {
      ...init,
      headers: { "X-N8N-API-KEY": opts.apiKey, accept: "application/json", ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) throw new Error("n8n rejected the API key");
    if (!res.ok) throw new Error(`n8n answered HTTP ${res.status} for ${path.split("?")[0]}`);
    return (await res.json()) as T;
  }

  /** Follows nextCursor until `stop` says the page is far enough back. */
  async function paged<T>(path: string, stop: (page: T[]) => boolean = () => false): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const sep = path.includes("?") ? "&" : "?";
      const page = await call<{ data: T[]; nextCursor?: string | null }>(`${path}${sep}limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      out.push(...page.data);
      if (!page.nextCursor || stop(page.data)) break;
      cursor = page.nextCursor;
    }
    return out;
  }

  return {
    workflows: () => paged<Workflow>("/workflows"),
    /** Executions newest first, back to `since` (epoch ms). */
    executions: async (since: number) =>
      (await paged<Execution>("/executions?includeData=false", (page) => page.some((e) => Date.parse(e.startedAt) < since))).filter(
        (e) => Date.parse(e.startedAt) >= since,
      ),
    retry: (executionId: string) => call<unknown>(`/executions/${encodeURIComponent(executionId)}/retry`, { method: "POST" }),
    setActive: (workflowId: string, active: boolean) =>
      call<unknown>(`/workflows/${encodeURIComponent(workflowId)}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
  };
}

export type N8nClient = ReturnType<typeof createN8nClient>;

function runStatus(e: Execution): RunView["status"] {
  const s = e.status ?? (e.finished ? "success" : "error");
  if (s === "success" || s === "running" || s === "waiting") return s;
  if (s === "canceled") return "canceled";
  return "error"; // error, crashed, failed
}

const fmtDuration = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

/**
 * The n8n adapter: failed runs from the last day become items that need you (one per workflow,
 * the newest, unless a retry already succeeded); successes collapse into one FYI line.
 */
export function createN8nAdapter(opts: { client: N8nClient; publicUrl: string; now?: () => number }): Adapter & {
  automations(): Promise<AutomationsPayload>;
  setActive(workflowId: string, active: boolean): Promise<ActResult>;
} {
  const now = opts.now ?? Date.now;
  const pub = opts.publicUrl.replace(/\/$/, "");
  const runHref = (e: Execution) => `${pub}/workflow/${e.workflowId}/executions/${e.id}`;
  let cache: { at: number; value: Promise<{ workflows: Workflow[]; executions: Execution[] }> } | undefined;

  function load() {
    if (cache && now() - cache.at < 30_000) return cache.value;
    const value = Promise.all([opts.client.workflows(), opts.client.executions(now() - DAY)]).then(([workflows, executions]) => ({
      workflows,
      executions,
    }));
    cache = { at: now(), value };
    value.catch(() => (cache = undefined));
    return value;
  }
  const invalidate = () => (cache = undefined);

  async function read(): Promise<Item[]> {
    const { workflows, executions } = await load();
    const names = new Map(workflows.map((w) => [w.id, w.name]));
    const retried = new Set(executions.filter((e) => e.retryOf && runStatus(e) === "success").map((e) => String(e.retryOf)));
    const items: Item[] = [];
    const seen = new Set<string>();
    for (const e of executions) {
      if (runStatus(e) !== "error" || seen.has(e.workflowId) || e.retrySuccessId || retried.has(String(e.id))) continue;
      seen.add(e.workflowId);
      items.push({
        id: `n8n:exec:${e.id}`,
        source: "n8n",
        kind: "run",
        title: names.get(e.workflowId) ?? `Workflow ${e.workflowId}`,
        context: `Run ${e.id} failed${e.stoppedAt ? ` after ${fmtDuration(Date.parse(e.stoppedAt) - Date.parse(e.startedAt))}` : ""}`,
        time: e.startedAt,
        status: "failed",
        route: "needs_action",
        actions: [
          { id: "retry", label: "Retry", primary: true },
          { id: "open", label: "Open run" },
        ],
        href: runHref(e),
        meta: { workflow: e.workflowId },
      });
    }
    const ok = executions.filter((e) => runStatus(e) === "success").length;
    if (ok) {
      items.push({
        id: "n8n:ok",
        source: "n8n",
        kind: "run",
        title: "Workflow runs",
        context: "Last 24 hours",
        time: executions.find((e) => runStatus(e) === "success")!.startedAt,
        status: "up",
        statusLabel: `${ok} succeeded`,
        route: "fyi",
        actions: [],
        href: `${pub}/home/executions`,
        meta: { count: ok },
      });
    }
    return items;
  }

  async function act(itemId: string, actionId: string): Promise<ActResult> {
    const m = /^n8n:exec:(.+)$/.exec(itemId);
    if (!m || actionId !== "retry") return { ok: false, message: "Unknown action" };
    try {
      await opts.client.retry(m[1]!);
      invalidate();
      return { ok: true, message: "Retry started" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Retry failed" };
    }
  }

  async function automations(): Promise<AutomationsPayload> {
    const { workflows, executions } = await load();
    const byWf = new Map<string, Execution[]>();
    for (const e of executions) byWf.set(e.workflowId, [...(byWf.get(e.workflowId) ?? []), e]);
    const views: WorkflowView[] = workflows.map((w) => {
      const runs = byWf.get(w.id) ?? [];
      return {
        id: w.id,
        name: w.name,
        active: w.active,
        recent: runs.slice(0, 5).map((e) => ({
          id: String(e.id),
          status: runStatus(e),
          startedAt: Date.parse(e.startedAt),
          durationMs: e.stoppedAt ? Date.parse(e.stoppedAt) - Date.parse(e.startedAt) : null,
          href: runHref(e),
        })),
        runsToday: runs.length,
        failedToday: runs.filter((e) => runStatus(e) === "error").length,
        href: `${pub}/workflow/${w.id}`,
      };
    });
    // Problems first, then active ones, then by name.
    views.sort((a, b) => b.failedToday - a.failedToday || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return { workflows: views, sample: false };
  }

  async function setActive(workflowId: string, active: boolean): Promise<ActResult> {
    try {
      await opts.client.setActive(workflowId, active);
      invalidate();
      return { ok: true, message: active ? "Workflow switched on" : "Workflow switched off" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "n8n didn't accept the change" };
    }
  }

  return {
    id: "n8n",
    name: "n8n",
    read,
    act,
    link: (item) => item.href,
    commands: (): Command[] => [
      { id: "n8n:open", label: "Open n8n", keywords: ["automations", "workflows"], scope: "nav", href: pub },
    ],
    automations,
    setActive,
  };
}
