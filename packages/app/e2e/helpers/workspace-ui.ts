import { expect, type Page } from "@playwright/test";

export async function openNewAgentComposer(page: Page): Promise<void> {
  await page.goto("/");

  const sidebarNewAgent = page.getByTestId("sidebar-new-agent").first();
  if (await sidebarNewAgent.isVisible().catch(() => false)) {
    await sidebarNewAgent.click();
  } else {
    await page.getByText("New agent", { exact: true }).first().click();
  }

  await expect(page.getByRole("textbox", { name: "Message agent..." })).toBeVisible({
    timeout: 30_000,
  });
}

export async function seedWorkspaceActivity(page: Page, marker: string): Promise<void> {
  const input = page.getByRole("textbox", { name: "Message agent..." });
  await expect(input).toBeEditable({ timeout: 30_000 });
  await input.fill(marker);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 30_000 });
}
