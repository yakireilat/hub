"use client";

import type { ActResult, Command, TodayView } from "@hub/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createHubClient } from "@/lib/client";

interface HubState {
  today: TodayView | null;
  commands: Command[];
  error: string | null;
  act(itemId: string, actionId: string): Promise<ActResult>;
  capture(text: string): Promise<ActResult>;
}

const HubContext = createContext<HubState | null>(null);

export function useHub(): HubState {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error("useHub outside HubProvider");
  return ctx;
}

export function HubProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createHubClient);
  const [today, setToday] = useState<TodayView | null>(null);
  const [commands, setCommands] = useState<Command[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([client.today(), client.commands()]);
      setToday(t);
      setCommands(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const value = useMemo<HubState>(
    () => ({
      today,
      commands,
      error,
      async act(itemId, actionId) {
        const result = await client.act(itemId, actionId);
        await refresh();
        return result;
      },
      capture: (text) => client.capture(text),
    }),
    [client, commands, error, refresh, today],
  );

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}
