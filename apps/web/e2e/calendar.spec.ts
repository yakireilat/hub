import { expect, test } from "@playwright/test";

test("Calendar: a week by day, invites to answer in words, and a clear next step while not connected", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  await expect(page.getByText("◌ Not connected")).toBeVisible();
  await expect(page.getByText(/Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/)).toBeVisible();

  const today = page.getByRole("region", { name: /^Today · / });
  await expect(today).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(7);
  // The sample invite reads as an invite and can be answered in place (not clicked: other specs use it).
  const invite = today.locator('[data-item-id="calendar:dentist"]');
  await expect(invite).toContainText("Invite");
  await expect(invite.getByRole("button", { name: "Accept" })).toBeVisible();
  // In time order: the 16:00 invite comes before the 19:30 study block.
  const titles = await today.getByRole("heading", { level: 3 }).allTextContents();
  expect(titles.indexOf("Dentist check-up")).toBeLessThan(titles.indexOf("Study block"));
  // No Google credentials: nothing to connect to, so no Connect or New event buttons.
  await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New event" })).toHaveCount(0);
});
