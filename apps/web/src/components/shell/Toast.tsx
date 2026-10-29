"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  ok: boolean;
  message: string;
}

const ToastContext = createContext<(t: { ok: boolean; message: string }) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const push = useCallback((t: { ok: boolean; message: string }) => {
    const id = next.current++;
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            data-testid="toast"
            className="rounded-[10px] border border-line bg-raised px-4 py-2.5 text-sm text-fg shadow-lg"
          >
            <span className={t.ok ? "text-st-up" : "text-st-failed"}>{t.ok ? "● " : "■ "}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
