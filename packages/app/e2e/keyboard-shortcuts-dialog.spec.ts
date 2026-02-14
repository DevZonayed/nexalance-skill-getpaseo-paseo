import { test, expect } from "./fixtures";
import { gotoHome } from "./helpers/app";

test("question mark opens keyboard shortcuts dialog", async ({ page }) => {
  await gotoHome(page);
  await page.getByTestId("menu-button").first().focus();

  await page.keyboard.press("Shift+/");

  const dialog = page.getByTestId("keyboard-shortcuts-dialog");
  const content = page.getByTestId("keyboard-shortcuts-dialog-content");

  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(content).toBeVisible({ timeout: 10000 });
  await expect(content).toContainText("Show keyboard shortcuts");
  await expect(content).toContainText("Toggle left sidebar");
});
