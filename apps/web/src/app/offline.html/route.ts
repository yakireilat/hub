import { color, status } from "@hub/tokens";

export const dynamic = "force-static";

const c = color.dark;

/** What the installed app shows when the hub can't be reached (off the tailnet, core-01 down). Cached by sw.js. */
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Hub · offline</title>
<style>
  body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:${c.ground};color:${c.text};
    font:15px/1.5 system-ui,-apple-system,sans-serif;padding:24px;box-sizing:border-box}
  main{max-width:420px;display:flex;flex-direction:column;gap:12px}
  h1{font-size:22px;margin:0}
  p{margin:0;color:${c.muted}}
  .st{color:${status.dark.failed}}
  button{min-height:44px;align-self:flex-start;padding:0 16px;border-radius:10px;border:0;background:${c.accent};color:${c.onAccent};font-weight:600;font-size:15px}
</style></head>
<body><main>
  <h1><span class="st">■ Offline</span> · can't reach the hub</h1>
  <p>Is this device on the tailnet? Open Tailscale, then try again. If it is, core-01 may be down.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main></body></html>`;

export function GET() {
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
