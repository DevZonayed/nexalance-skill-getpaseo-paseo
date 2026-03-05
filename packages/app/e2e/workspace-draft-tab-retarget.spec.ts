import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { createAgentInRepo } from "./helpers/app";
import { createTempGitRepo } from "./helpers/workspace";
import {
  ensureWorkspaceAgentPaneVisible,
  getWorkspaceTabTestIds,
  sampleWorkspaceTabIds,
  waitForWorkspaceTabsVisible,
} from "./helpers/workspace-tabs";
import { switchWorkspaceViaSidebar } from "./helpers/workspace-ui";

async function expectComposerFocused(page: Page) {
  const composer = page.getByRole("textbox", { name: "Message agent..." }).first();
  await expect(composer).toBeEditable({ timeout: 30_000 });
  await expect
    .poll(async () => {
      return await composer.evaluate(
        (element) => document.activeElement === element
      );
    })
    .toBe(true);
}

test("workspace draft submit retargets tab in place without transient extra tabs", async ({ page }) => {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error("E2E_SERVER_ID is not set.");
  }

  const repo = await createTempGitRepo("paseo-e2e-draft-retarget-");
  const seedPrompt = `seed prompt ${Date.now()}`;
  const createPrompt = `retarget prompt ${Date.now()}`;

  try {
    await createAgentInRepo(page, { directory: repo.path, prompt: seedPrompt });

    await switchWorkspaceViaSidebar({ page, serverId, targetWorkspacePath: repo.path });
    await waitForWorkspaceTabsVisible(page);
    await ensureWorkspaceAgentPaneVisible(page);

    const beforeDraftIds = await getWorkspaceTabTestIds(page);
    await page.getByTestId("workspace-new-agent-tab").first().click();
    await ensureWorkspaceAgentPaneVisible(page);
    await expect(page.getByRole("textbox", { name: "Message agent..." })).toBeEditable();

    const withDraftIds = await getWorkspaceTabTestIds(page);
    expect(withDraftIds.length).toBe(beforeDraftIds.length + 1);
    const draftTabTestId = withDraftIds.find((id) => !beforeDraftIds.includes(id));
    expect(draftTabTestId).toBeTruthy();

    const draftId = draftTabTestId!.replace("workspace-tab-", "");
    const draftCloseButton = page.getByTestId(`workspace-draft-close-${draftId}`).first();
    await expect(draftCloseButton).toBeVisible({ timeout: 30_000 });

    const samplingPromise = sampleWorkspaceTabIds(page, { durationMs: 3_000, intervalMs: 40 });
    const input = page.getByRole("textbox", { name: "Message agent..." });
    await input.fill(createPrompt);
    await input.press("Enter");
    await expect(page.getByText(createPrompt, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    const snapshots = await samplingPromise;
    const maxObservedCount = snapshots.reduce((max, ids) => Math.max(max, ids.length), 0);
    expect(maxObservedCount).toBe(withDraftIds.length);

    const finalIds = await getWorkspaceTabTestIds(page);
    expect(finalIds.length).toBe(withDraftIds.length);
    expect(finalIds).toContain(draftTabTestId!);
    await expect(draftCloseButton).not.toBeVisible({ timeout: 30_000 });
  } finally {
    await repo.cleanup();
  }
});

test("workspace agent tab switch focuses composer on desktop web", async ({ page }) => {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error("E2E_SERVER_ID is not set.");
  }

  const repo = await createTempGitRepo("paseo-e2e-tab-focus-");
  const firstPrompt = `first tab prompt ${Date.now()}`;
  const secondPrompt = `second tab prompt ${Date.now()}`;

  try {
    await createAgentInRepo(page, { directory: repo.path, prompt: firstPrompt });
    await switchWorkspaceViaSidebar({ page, serverId, targetWorkspacePath: repo.path });
    await waitForWorkspaceTabsVisible(page);
    await ensureWorkspaceAgentPaneVisible(page);

    const beforeSecondAgentIds = await getWorkspaceTabTestIds(page);
    await page.getByTestId("workspace-new-agent-tab").first().click();
    await expectComposerFocused(page);

    const composer = page.getByRole("textbox", { name: "Message agent..." }).first();
    await composer.fill(secondPrompt);
    await composer.press("Enter");
    await expect(page.getByText(secondPrompt, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    const withSecondAgentIds = await getWorkspaceTabTestIds(page);
    const secondAgentTabTestId = withSecondAgentIds.find(
      (id) => !beforeSecondAgentIds.includes(id)
    );
    if (!secondAgentTabTestId) {
      throw new Error("Expected second agent tab to be created.");
    }

    const firstAgentTabTestId = beforeSecondAgentIds[0];
    if (!firstAgentTabTestId) {
      throw new Error("Expected first agent tab to exist.");
    }

    await page.getByTestId(firstAgentTabTestId).first().click();
    await expectComposerFocused(page);

    await page.getByTestId(secondAgentTabTestId).first().click();
    await expectComposerFocused(page);
  } finally {
    await repo.cleanup();
  }
});
