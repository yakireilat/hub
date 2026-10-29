export interface NavEntry {
  slug: string;
  href: string;
  label: string;
  /** Second key of the `g <key>` shortcut. */
  key: string;
  /** Phase that brings the real screen. */
  phase?: number;
}

export const NAV: NavEntry[] = [
  { slug: "today", href: "/", label: "Today", key: "t" },
  { slug: "calendar", href: "/calendar", label: "Calendar", key: "c", phase: 5 },
  { slug: "inbox", href: "/inbox", label: "Inbox", key: "i", phase: 4 },
  { slug: "automations", href: "/automations", label: "Automations", key: "a", phase: 4 },
  { slug: "notes", href: "/notes", label: "Notes", key: "n", phase: 6 },
  { slug: "services", href: "/services", label: "Services", key: "s", phase: 3 },
  { slug: "docs", href: "/docs", label: "Docs", key: "d", phase: 6 },
];

export const SPACES = [
  { id: "work", label: "Work", color: "var(--hub-info)" },
  { id: "home-server", label: "Home server", color: "var(--hub-up)" },
  { id: "study", label: "Study", color: "#C49AF2" },
];
