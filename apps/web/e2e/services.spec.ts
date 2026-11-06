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
