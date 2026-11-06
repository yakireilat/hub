import { expect, test } from "@playwright/test";

test("Services groups by node, puts problems first and pairs shape with word", async ({ page }) => {
  await page.goto("/services");
  await expect(page.getByRole("heading", { level: 1, name: "Services" })).toBeVisible();
  await expect(page.getByText("▲ 1 slow")).toBeVisible();

  const node = page.getByRole("region", { name: "core-01" });
  const rows = node.getByTestId("item");
  await expect(rows.first()).toContainText("Jellyfin");
  await expect(rows.first()).toContainText("Slow");
  await expect(node.getByRole("link", { name: /^Gitea: Up, core-01/ })).toHaveAttribute("href", "https://gitea.mesh.net");
});

test("Smart add checks a new service, keeps its history, and remove has undo", async ({ page, isMobile }) => {
  test.skip(isMobile, "one run is enough; the form is the same on phones");
  await page.goto("/services");
  await page.getByLabel("Add a service").fill("http://localhost:3000/api/health");
  await page.getByRole("button", { name: "Find it" }).click();

  const form = page.getByRole("form", { name: "Add service" });
  await expect(form.getByLabel("Name")).toHaveValue("Localhost");
  await expect(form.getByLabel("Node")).toHaveValue("core-01");
  await form.getByLabel("Name").fill("Hub itself");
  await form.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByTestId("toast").first()).toContainText("Added Hub itself");

  // Real services replace the samples; the new one is checked right away and has history.
  const row = page.getByRole("link", { name: /^Hub itself: Up, core-01 .*100% up in 24 hours/ });
  await expect(row).toBeVisible();
  await expect(row.getByRole("img", { name: /Last 24 hours: 100% up, 0 failed checks/ })).toBeVisible();
  await expect(page.getByText("Jellyfin")).toHaveCount(0);

  await page.getByRole("button", { name: "Edit services" }).click();
  await page.getByRole("button", { name: "Remove Hub itself" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Remove Hub itself" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Hub itself" }).click();
  const edit = page.getByRole("form", { name: "Save Hub itself" });
  await edit.getByLabel("Slow after (ms)").fill("3000");
  await edit.getByRole("button", { name: "Save Hub itself" }).click();
  await expect(page.getByText("Saved Hub itself")).toBeVisible();

  // Leave the server as we found it, so the other specs still see the sample services.
  await page.getByRole("button", { name: "Remove Hub itself" }).click();
  await expect(page.getByText("These are sample services")).toBeVisible();
});

test("The palette opens Add a service", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcuts are desktop-only");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("add a service");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/services\?add=1$/);
  await expect(page.getByLabel("Add a service")).toBeVisible();
});
