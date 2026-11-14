import { expect, test } from "@playwright/test";

test("Inbox: snoozing moves an item out of Needs action (and off Today) until it's unsnoozed", async ({ page, isMobile }) => {
  test.skip(isMobile, "one run is enough; the flow is the same on phones");
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();

  const needs = page.getByRole("tab", { name: /Needs action/ });
  await expect(needs).toHaveAttribute("aria-selected", "true");
  const invite = page.getByRole("button", { name: /^Dentist check-up/ });
  await invite.click();

  const detail = page.getByRole("complementary", { name: "Item detail" });
  await expect(detail.getByRole("heading", { name: "Dentist check-up" })).toBeVisible();
  await expect(detail).toContainText("No rule in hub.yaml matched");
  await detail.getByRole("button", { name: "Snooze 1 h" }).click();
  await expect(page.getByRole("button", { name: /^Dentist check-up/ })).toHaveCount(0);

  await page.getByRole("tab", { name: /Snoozed/ }).click();
  await page.getByRole("button", { name: /^Dentist check-up/ }).click();
  await expect(detail).toContainText("Snoozed until today");

  // Today agrees: the snoozed invite no longer needs you.
  await page.goto("/");
  await expect(page.locator('[data-item-id="calendar:dentist"]')).toHaveCount(0);

  // Leave things as they were for the other specs.
  await page.goto("/inbox");
  await page.getByRole("tab", { name: /Snoozed/ }).click();
  await page.getByRole("button", { name: /^Dentist check-up/ }).click();
  await detail.getByRole("button", { name: "Unsnooze" }).click();
  await page.getByRole("tab", { name: /Needs action/ }).click();
  await expect(page.getByRole("button", { name: /^Dentist check-up/ })).toBeVisible();
});
