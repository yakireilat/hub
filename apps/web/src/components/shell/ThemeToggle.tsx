"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function stored(): Theme {
  try {
    return localStorage.getItem("hub-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => setTheme(stored()), []);

  function flip() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("hub-theme", next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="flex size-11 items-center justify-center rounded-[10px] border border-line text-fg-soft hover:bg-raised"
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

/** Inline before paint so a light-theme user never sees a dark flash. */
export const themeBootScript = `try{if(localStorage.getItem("hub-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
