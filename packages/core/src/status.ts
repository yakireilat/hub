/** Every status pairs a shape and a word so it never relies on colour alone. */
export const STATUSES = ["up", "slow", "failed", "info", "idle"] as const;
export type Status = (typeof STATUSES)[number];

export const statusShape: Record<Status, string> = {
  up: "●",
  slow: "▲",
  failed: "■",
  info: "◆",
  idle: "◌",
};

export const statusWord: Record<Status, string> = {
  up: "Up",
  slow: "Slow",
  failed: "Failed",
  info: "Info",
  idle: "Idle",
};
