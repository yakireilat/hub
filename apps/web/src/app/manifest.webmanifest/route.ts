import { color } from "@hub/tokens";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Served by hand, not as app/manifest.ts, so the <link> can carry crossorigin="use-credentials" (see layout.tsx):
 * behind Authelia a manifest fetched without the session cookie would get the login page.
 *
 * Makes the hub installable: home-screen icon, own window, no browser bars. */
function manifest(): MetadataRoute.Manifest {
  return {
    id: `${base}/`,
    name: "Hub",
    short_name: "Hub",
    description: "The front door of the Mesh",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "any",
    background_color: color.dark.ground,
    theme_color: color.dark.ground,
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Inbox", url: `${base}/inbox` },
      { name: "Calendar", url: `${base}/calendar` },
      { name: "Services", url: `${base}/services` },
    ],
  };
}

export function GET() {
  return new Response(JSON.stringify(manifest()), { headers: { "content-type": "application/manifest+json" } });
}
