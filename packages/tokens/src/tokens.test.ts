import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { color, status } from "./index";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

function block(theme: "dark" | "light") {
  const start = css.indexOf(`[data-theme="${theme}"]`);
  return css.slice(start, css.indexOf("}", start));
}

describe("tokens.css matches index.ts", () => {
  for (const theme of ["dark", "light"] as const) {
    it(`${theme} theme`, () => {
      const b = block(theme);
      for (const [k, v] of Object.entries({ ...color[theme], ...status[theme] })) {
        expect(b, `--hub-${kebab(k)}`).toContain(`--hub-${kebab(k)}: ${v};`);
      }
    });
  }
});
