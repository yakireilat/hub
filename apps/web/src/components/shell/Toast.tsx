"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastInput {
  ok: boolean;
  message: string;
  /** One follow-up, such as Undo. */
  action?: { label: string; run: () => void };
}

interface Toast extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const push = useCallback((t: ToastInput) => {
    const id = next.current++;
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    // A toast with an action stays longer, so there is time to reach it.
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.action ? 8000 : 4000);
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
            className="pointer-events-auto flex items-center gap-3 rounded-[10px] border border-line bg-raised px-4 py-2.5 text-sm text-fg shadow-lg"
          >
            <span>
              <span className={t.ok ? "text-st-up" : "text-st-failed"}>{t.ok ? "● " : "■ "}</span>
              {t.message}
            </span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
                className="min-h-9 rounded-lg px-2.5 font-semibold text-accent hover:bg-surface"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
