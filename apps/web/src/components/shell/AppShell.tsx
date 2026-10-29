"use client";

import type { Command as HubCommand } from "@hub/core";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { NAV, SPACES } from "@/lib/nav";
import { ThemeToggle } from "./ThemeToggle";

const MOBILE_TABS = ["today", "calendar", "inbox", "automations"];

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function AppShell({ children, commands, needsCount }: { children: ReactNode; commands: HubCommand[]; needsCount: number }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (paletteOpen || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const entry = NAV.find((n) => n.key === e.key);
        if (entry) {
          e.preventDefault();
          router.push(entry.href);
        }
        return;
      }
      if (e.key === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
      } else if (e.key === "c") {
        e.preventDefault();
        const field = document.getElementById("capture");
        if (field) field.focus();
        else router.push("/?capture=1");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, router]);

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh">
      <nav aria-label="Main" className="hidden w-60 flex-none flex-col gap-1 border-r border-divider bg-rail px-3 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-2.5 pb-4 pt-1">
          <div className="flex size-7 items-center justify-center rounded-lg bg-accent font-bold text-on-accent">H</div>
          <div className="flex flex-col">
            <span className="font-semibold">Hub</span>
            <span className="font-mono text-[11px] text-muted">hub.mesh.net</span>
          </div>
        </div>
        {NAV.map((n) => (
          <Link
            key={n.slug}
            href={n.href}
            aria-current={active(n.href) ? "page" : undefined}
            className={`flex min-h-10 items-center justify-between rounded-lg px-2.5 ${
              active(n.href) ? "bg-raised text-fg" : "text-fg-soft hover:bg-raised/60"
            }`}
          >
            <span>{n.label}</span>
            <span className="font-mono text-[11px] text-muted">
              {n.slug === "inbox" && needsCount > 0 ? needsCount : `g ${n.key}`}
            </span>
          </Link>
        ))}
        <div className="label-caps mt-4 px-2.5 pb-1 text-[11px]!">Spaces</div>
        {SPACES.map((s) => (
          <span key={s.id} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-fg-soft">
            <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-divider px-4 py-3 md:px-7">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex min-h-11 min-w-0 max-w-xl flex-1 items-center justify-between gap-2 rounded-[10px] border border-line bg-surface px-3.5 text-left text-muted"
          >
            <span className="truncate">Search or run a command…</span>
            <kbd className="hidden rounded-[5px] border border-line px-1.5 py-0.5 font-mono text-xs md:inline">⌘K</kbd>
          </button>
          <div className="ml-auto" />
          <ThemeToggle />
          <div role="img" aria-label="Signed in as Yakir" className="flex size-9 items-center justify-center rounded-full bg-line font-semibold">
            Y
          </div>
        </header>
        <main className="w-full max-w-[1180px] flex-1 px-4 pb-28 pt-6 md:px-7 md:pb-10">{children}</main>
      </div>

      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-divider bg-rail px-2 pb-6 pt-1.5 md:hidden">
        {NAV.filter((n) => MOBILE_TABS.includes(n.slug)).map((n) => (
          <Link
            key={n.slug}
            href={n.href}
            aria-current={active(n.href) ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] ${active(n.href) ? "text-accent-soft" : "text-muted"}`}
          >
            <span aria-hidden="true" className={`h-[3px] w-5 rounded-sm ${active(n.href) ? "bg-accent" : "bg-transparent"}`} />
            {n.slug === "automations" ? "Runs" : n.label}
          </Link>
        ))}
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </div>
  );
}
