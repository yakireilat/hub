import { expect, test } from "@playwright/test";

test("Automations lists workflows with shape-and-word status and the actions each needs", async ({ page }) => {
  await page.goto("/automations");
  await expect(page.getByRole("heading", { level: 1, name: "Automations" })).toBeVisible();
  await expect(page.getByText("These are sample workflows")).toBeVisible();

  const rows = page.getByRole("region", { name: "Workflows" }).getByTestId("item");
  await expect(rows).toHaveCount(3);
  // Problems first: the failed backup leads, says so in words, and offers Retry.
  await expect(rows.first()).toContainText("Nightly backup");
  await expect(rows.first()).toContainText("Last run failed");
  await expect(rows.first().getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pi-hole daily report: switch on" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("2 of 3 on")).toBeVisible();
});
