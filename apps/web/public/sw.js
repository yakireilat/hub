// The hub's service worker. It caches one thing, the offline page, and never the hub's screens or data,
// so a deploy is visible at once. When a page can't load (off the tailnet, core-01 down) it shows that page.
const CACHE = "hub-offline-v1";
const OFFLINE = new URL("offline.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // redirect: manual, so an Authelia login redirect is never cached as the offline page.
      const res = await fetch(OFFLINE, { redirect: "manual", cache: "no-store" });
      if (res.ok) await (await caches.open(CACHE)).put(OFFLINE, res);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error()),
  );
});
