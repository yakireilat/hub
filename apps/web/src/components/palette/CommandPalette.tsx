"use client";

import { parseQuery, type Command as HubCommand, type Scope } from "@hub/core";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";
import { NAV } from "@/lib/nav";

const SCOPES: { scope: Scope | "all"; prefix: string; label: string }[] = [
  { scope: "all", prefix: "", label: "All" },
  { scope: "action", prefix: ">", label: "Actions" },
  { scope: "note", prefix: "#", label: "Notes & docs" },
  { scope: "calendar", prefix: "@", label: "Calendar" },
  { scope: "service", prefix: "/", label: "Services" },
];

const GROUPS: { scope: Scope; label: string; icon: string; tone: string }[] = [
  { scope: "action", label: "Actions", icon: ">", tone: "text-accent" },
  { scope: "note", label: "Notes & docs", icon: "#", tone: "text-[#C49AF2]" },
  { scope: "calendar", label: "Calendar", icon: "@", tone: "text-st-info" },
  { scope: "service", label: "Services", icon: "/", tone: "text-st-up" },
  { scope: "nav", label: "Go to", icon: "→", tone: "text-muted" },
];

const navCommands: HubCommand[] = NAV.map((n) => ({
  id: `nav:${n.slug}`,
  label: `Go to ${n.label}`,
  keywords: [`g ${n.key}`],
  scope: "nav",
  href: n.href,
}));

function matches(cmd: HubCommand, text: string) {
  if (!text) return true;
  const hay = [cmd.label, ...(cmd.keywords ?? [])].join(" ").toLowerCase();
  return text.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function Highlight({ label, text }: { label: string; text: string }) {
  const word = text.trim().split(/\s+/)[0] ?? "";
  const at = word ? label.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (at < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, at)}
      <mark className="rounded-[3px] bg-accent/25 text-accent-soft">{label.slice(at, at + word.length)}</mark>
      {label.slice(at + word.length)}
    </>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: HubCommand[];
}) {
  const [raw, setRaw] = useState("");
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const { act } = useHub();
  const { scope, text } = parseQuery(raw);

  const groups = useMemo(() => {
    const all = [...commands, ...navCommands].filter(
      (c) => (scope === "all" || c.scope === scope) && matches(c, text),
    );
    return GROUPS.map((g) => ({ ...g, items: all.filter((c) => c.scope === g.scope) })).filter((g) => g.items.length);
  }, [commands, scope, text]);

  function setScope(s: Scope | "all") {
    const prefix = SCOPES.find((x) => x.scope === s)?.prefix ?? "";
    setRaw(prefix ? `${prefix} ${text}` : text);
  }

  function close() {
    onOpenChange(false);
    setRaw("");
  }

  function run(cmd: HubCommand, inSource = false) {
    close();
    if (cmd.action && !inSource) {
      const { itemId, actionId } = cmd.action;
      start(async () => toast(await act(itemId ?? cmd.id, actionId)));
    } else if (cmd.href?.startsWith("/")) {
      router.push(cmd.href);
    } else if (cmd.href) {
      window.open(cmd.href, "_blank", "noreferrer");
    }
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      label="Command palette"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-40 bg-black/60"
      contentClassName="fixed inset-x-3 top-[12vh] z-50 mx-auto max-w-[760px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
    >
      <div className="flex min-h-15 items-center gap-3 border-b border-divider px-4">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <Command.Input
          value={raw}
          onValueChange={setRaw}
          placeholder="Search or run…  > actions  # notes  @ calendar  / services"
          className="min-h-14 flex-1 bg-transparent text-lg text-fg outline-none placeholder:text-muted focus-visible:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const i = SCOPES.findIndex((s) => s.scope === scope);
              setScope(SCOPES[(i + (e.shiftKey ? SCOPES.length - 1 : 1)) % SCOPES.length]!.scope);
            }
          }}
        />
        <kbd className="rounded-[5px] border border-line px-1.5 py-0.5 font-mono text-xs text-muted">esc</kbd>
      </div>

      <div role="tablist" aria-label="Scope" className="flex flex-wrap gap-2 border-b border-divider px-4 py-3">
        {SCOPES.map((s) => (
          <button
            key={s.scope}
            type="button"
            role="tab"
            aria-selected={scope === s.scope}
            onClick={() => setScope(s.scope)}
            className={`min-h-9 rounded-full border px-3 text-[13px] ${
              scope === s.scope ? "border-accent bg-accent/10 text-accent-soft" : "border-line text-fg-soft"
            }`}
          >
            {s.prefix && <span className="font-mono">{s.prefix} </span>}
            {s.label}
          </button>
        ))}
      </div>

      <Command.List className="max-h-[56vh] overflow-y-auto py-2">
        <Command.Empty className="px-5 py-6 text-muted">Nothing matches “{text}”.</Command.Empty>
        {groups.map((g) => (
          <Command.Group
            key={g.scope}
            heading={g.label}
            className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5"
          >
            {g.items.map((c) => (
              <Command.Item
                key={c.id}
                value={c.id}
                onSelect={() => run(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(c, true);
                }}
                className="group mx-2 flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 data-[selected=true]:bg-raised"
              >
                <span aria-hidden="true" className={`flex size-7 items-center justify-center rounded-[7px] bg-raised font-mono text-xs ${g.tone}`}>
                  {g.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <Highlight label={c.label} text={text} />
                </span>
                <span className="hidden font-mono text-xs text-muted group-data-[selected=true]:inline">
                  {c.action ? "↵ run" : "↵ open"}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>

      <div className="flex flex-wrap gap-4 border-t border-divider px-4 py-3 text-xs text-muted">
        <span><kbd className="font-mono">↑↓</kbd> move</span>
        <span><kbd className="font-mono">tab</kbd> scope</span>
        <span><kbd className="font-mono">⌘↵</kbd> open in source</span>
        <span className="ml-auto">{groups.reduce((n, g) => n + g.items.length, 0)} results</span>
      </div>
    </Command.Dialog>
  );
}
