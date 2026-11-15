import { expect, test } from "@playwright/test";

test("Settings → API: create a token, use it within its scope, see the calls, revoke it", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "The full flow runs once; the phone check is below");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "New token" }).click();
  const form = page.getByRole("form", { name: "New token" });
  await form.getByLabel("Name: who will use it").fill("E2E robot");
  await form.getByRole("checkbox", { name: /services:read/ }).check();
  await form.getByRole("button", { name: "Create token" }).click();
  const token = (await page.getByTestId("new-token").textContent())!.trim();
  expect(token).toMatch(/^hub_[a-f0-9]{12}_/);
  await page.getByRole("button", { name: "Done" }).click();

  const auth = { authorization: `Bearer ${token}` };
  expect((await request.get("/api/v1/services", { headers: auth })).status()).toBe(200);
  expect((await request.get("/api/v1/inbox", { headers: auth })).status()).toBe(403);
  expect((await request.get("/api/v1/tokens", { headers: auth })).status()).toBe(403);
  const spec = await request.get("/api/v1/openapi.json", { headers: auth });
  expect((await spec.json()).openapi).toBe("3.1.0");

  // The log names each call with its status word and the reason it was refused.
  await page.getByRole("button", { name: "Refresh" }).click();
  const log = page.getByRole("region", { name: "Audit log" }).getByTestId("item");
  await expect(log.filter({ hasText: "GET /api/v1/tokens" }).first()).toContainText("person only");
  await expect(log.filter({ hasText: "GET /api/v1/inbox" }).first()).toContainText("missing scope");
  await expect(log.filter({ hasText: "GET /api/v1/services" }).first()).toContainText("200");

  const row = page.locator("#tokens").getByTestId("item").filter({ hasText: "E2E robot" }).first();
  await expect(row).toContainText("Active");
  await row.getByRole("button", { name: "Revoke E2E robot" }).click();
  await row.getByRole("button", { name: "Confirm revoke E2E robot" }).click();
  await expect(page.getByText(/Revoked “E2E robot”/)).toBeVisible();
  expect((await request.get("/api/v1/services", { headers: auth })).status()).toBe(401);
});

test("Settings opens from the palette and the form fits a phone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search or run a command…" }).click();
  await page.getByRole("dialog").getByRole("combobox").fill("api token");
  await page.getByRole("option", { name: /Create an API token/ }).click();
  await expect(page).toHaveURL(/\/settings/);
  const form = page.getByRole("form", { name: "New token" });
  await expect(form).toBeVisible();
  for (const box of await form.getByRole("checkbox").all()) {
    const h = (await box.locator("xpath=ancestor::label").boundingBox())!.height;
    expect(h).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole("link", { name: "OpenAPI description →" })).toBeVisible();
});
