import { test, expect, type Page } from "./fixtures";
import {
  createAgent,
  ensureHostSelected,
  gotoHome,
  setWorkingDirectory,
} from "./helpers/app";
import { createTempGitRepo } from "./helpers/workspace";

function buildWorkspaceRoute(serverId: string, workspacePath: string): string {
  return `/h/${encodeURIComponent(serverId)}/workspace/${encodeURIComponent(workspacePath)}`;
}

async function openWorkspaceWithAgent(page: Page, workspacePath: string): Promise<void> {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error("E2E_SERVER_ID is not set.");
  }

  await gotoHome(page);
  await ensureHostSelected(page);
  await setWorkingDirectory(page, workspacePath);
  await createAgent(page, `workspace header restore ${Date.now()}`);

  await page.goto(buildWorkspaceRoute(serverId, workspacePath));
  await expect(page).toHaveURL(new RegExp(`/h/${encodeURIComponent(serverId)}/workspace/`), {
    timeout: 30000,
  });
  await expect(page.getByTestId("workspace-new-tab").first()).toBeVisible({
    timeout: 30000,
  });
}

test("workspace new-tab menu opens on-screen", async ({ page }) => {
  const repo = await createTempGitRepo("paseo-e2e-workspace-new-tab-");

  try {
    await openWorkspaceWithAgent(page, repo.path);

    const trigger = page.getByTestId("workspace-new-tab").first();
    await expect(trigger).toBeVisible({ timeout: 30000 });
    await trigger.click();

    const menu = page.getByTestId("workspace-new-tab-content").first();
    await expect(menu).toBeVisible({ timeout: 10000 });

    const menuBounds = await menu.boundingBox();
    const viewport = page.viewportSize();

    expect(menuBounds).not.toBeNull();
    expect(viewport).not.toBeNull();

    if (!menuBounds || !viewport) {
      return;
    }

    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.y).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(viewport.height);
  } finally {
    await repo.cleanup();
  }
});

test("workspace explorer toggle opens and closes explorer", async ({ page }) => {
  const repo = await createTempGitRepo("paseo-e2e-workspace-explorer-toggle-");

  try {
    await openWorkspaceWithAgent(page, repo.path);

    const toggle = page.getByTestId("workspace-explorer-toggle").first();
    const explorerHeader = page.locator('[data-testid="explorer-header"]:visible').first();
    await expect(toggle).toBeVisible({ timeout: 30000 });

    const initiallyExpanded = (await toggle.getAttribute("aria-expanded")) === "true";
    if (initiallyExpanded) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(explorerHeader).not.toBeVisible({ timeout: 10000 });
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(explorerHeader).toBeVisible({ timeout: 10000 });

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(explorerHeader).not.toBeVisible({ timeout: 10000 });
  } finally {
    await repo.cleanup();
  }
});
