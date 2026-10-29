import { expect, test } from "@playwright/test";

test.describe("Today", () => {
  test("opens with the verdict and needs-attention items", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/need(s)? you/);
    await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    await expect(page.getByTestId("now-line")).toBeVisible();
  });

  test("status pairs a shape with a word", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("▲ slow · 2.4 s")).toBeVisible();
  });
});

test.describe("keyboard", () => {
  test.skip(({ isMobile }) => isMobile, "keyboard shortcuts are desktop-only");

  test("⌘K opens the palette, typing filters, Esc closes", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    await page.keyboard.type("backup");
    await expect(dialog.getByRole("option")).not.toHaveCount(0);
    await expect(dialog.getByRole("option", { name: /Retry: Nightly backup/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("prefix > limits the palette to actions; Tab cycles scope", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await page.keyboard.type("> ");
    await expect(dialog.getByRole("tab", { name: /Actions/ })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("option", { name: /Go to/ })).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("tab", { name: /Notes/ })).toHaveAttribute("aria-selected", "true");
  });

  test("palette navigation runs with Enter", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("go to services");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/services$/);
  });

  test("g i jumps to Inbox, g t back to Today", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").press("g");
    await page.locator("body").press("i");
    await expect(page).toHaveURL(/\/inbox$/);
    await page.locator("body").press("g");
    await page.locator("body").press("t");
    await expect(page).toHaveURL(/\/$/);
  });

  test("c focuses capture, Enter saves", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").press("c");
    await expect(page.locator("#capture")).toBeFocused();
    await page.keyboard.type("call the bank");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("toast")).toContainText("Captured");
  });

  test("acting in place clears an item", async ({ page }) => {
    await page.goto("/");
    const backup = page.locator('[data-item-id="n8n:backup"]');
    // Mock state lives as long as the server; a reused dev server may already have retried it.
    test.skip((await backup.count()) === 0, "backup was already retried on this server");
    await backup.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("toast")).toContainText("Backup retried");
    await expect(backup).toHaveCount(0);
  });
});

test("phone shows the tab bar and hides the rail", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
});
