import { expect, test } from "@playwright/test";

test("Calendar on desktop: a week grid with events placed by time, and events open in a dialog", async ({ page, isMobile }) => {
  test.skip(isMobile, "the grid is the desktop view");
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  await expect(page.getByText("◌ Not connected")).toBeVisible();
  await expect(page.getByText(/Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/)).toBeVisible();

  const grid = page.getByTestId("week-grid");
  await expect(grid).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /\d+ – \d+|–/ })).toBeVisible();

  // Placed by time: the 16:00 invite sits below the 09:30 standup, and says it's an invite in words.
  const standup = grid.getByRole("button", { name: /^Standup, 09:30/ });
  const invite = grid.getByRole("button", { name: /^Invite: Dentist check-up, 16:00/ });
  const [a, b] = [await standup.boundingBox(), await invite.boundingBox()];
  expect(b!.y).toBeGreaterThan(a!.y);
  await expect(invite).toContainText("Invite ·");

  // A sample event opens read-only, with the invite's own buttons (not clicked: other specs use it).
  await invite.click();
  const dialog = page.getByRole("dialog", { name: "Dentist check-up" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Accept" })).toBeVisible();
  await expect(dialog).toContainText("Sample event");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Not connected: no New event, and empty slots don't offer one.
  await expect(page.getByRole("button", { name: "New event" })).toHaveCount(0);
  await expect(grid.getByRole("button", { name: /^New event / })).toHaveCount(0);
});

test("Calendar weeks: next, previous and back to this week", async ({ page }) => {
  await page.goto("/calendar");
  const range = page.getByRole("navigation", { name: "Weeks" }).getByRole("heading");
  const thisWeek = await range.textContent();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/);
  await expect(range).not.toHaveText(thisWeek!);
  await page.getByRole("button", { name: "Today" }).click();
  await expect(range).toHaveText(thisWeek!);
});

test("Calendar on phones: one day after another", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await page.goto("/calendar");
  await expect(page.getByTestId("week-grid")).toBeHidden();
  await expect(page.getByRole("region", { name: /^Today · / })).toBeVisible();
});
