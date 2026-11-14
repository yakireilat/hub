/** One n8n run, as the hub shows it. */
export interface RunView {
  id: string;
  status: "success" | "error" | "running" | "waiting" | "canceled";
  /** Epoch ms. */
  startedAt: number;
  /** Milliseconds; null while still running. */
  durationMs: number | null;
  href: string;
}

export interface WorkflowView {
  id: string;
  name: string;
  active: boolean;
  /** Newest run first, up to five. */
  recent: RunView[];
  runsToday: number;
  failedToday: number;
  href: string;
}

export interface AutomationsPayload {
  workflows: WorkflowView[];
  /** True while n8n isn't connected (no N8N_API_KEY) and the screen shows sample data. */
  sample: boolean;
  /** Set when n8n didn't answer. */
  error?: string;
}
