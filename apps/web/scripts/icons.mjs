// Renders the hub's app icons (home screen, PWA, favicon) from the design tokens. Run: node scripts/icons.mjs
// The PNGs are committed; rerun only when the mark or the tokens change.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ACCENT = "#F0B44C"; // packages/tokens color.dark.accent
const ON_ACCENT = "#0D0E11"; // packages/tokens color.dark.onAccent
const out = path.join(import.meta.dirname, "../public/icons");
mkdirSync(out, { recursive: true });

/** The rail's mark: a bold H on the accent. `full` fills the square (iOS and maskable icons crop corners themselves). */
const svg = (full) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${full ? 0 : 112}" fill="${ACCENT}"/>
  <path fill="${ON_ACCENT}" d="M${full ? "178 160h52v76h52v-76h52v192h-52v-72h-52v72h-52z" : "150 118h64v104h84V118h64v276h-64V280h-84v114h-64z"}"/>
</svg>`;

writeFileSync(path.join(out, "icon.svg"), svg(false));
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, full] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(full)}`);
  await page.screenshot({ path: path.join(out, name), omitBackground: true });
}
await browser.close();
console.log("icons written to", out);
