import { expect, test } from "@playwright/test";

test("the hub is installable: manifest, icons, iPhone tags", async ({ page, request }) => {
  await page.goto("/");
  // With credentials, or Authelia would answer the manifest request with its login page.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("crossorigin", "use-credentials");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");

  const res = await request.get("/manifest.webmanifest");
  expect(res.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "Hub", display: "standalone", start_url: "/" });
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toEqual(["any", "any", "maskable"]);
  for (const src of [...manifest.icons.map((i: { src: string }) => i.src), "/icons/apple-touch-icon.png", "/icons/icon.svg"]) {
    expect((await request.get(src)).status(), src).toBe(200);
  }
});

test("off the tailnet, the installed app says so instead of a browser error", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "Service worker behaviour is the same on phones; once is enough");
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.goto("/inbox").catch(() => {});
  await expect(page.getByRole("heading", { name: /Offline/ })).toBeVisible();
  await expect(page.getByText("Is this device on the tailnet?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
});

test("the phone tab bar clears the home indicator", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phones only");
  await page.goto("/");
  const pad = await page.getByRole("navigation", { name: "Tabs" }).evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(pad).toBeGreaterThanOrEqual(24);
});
