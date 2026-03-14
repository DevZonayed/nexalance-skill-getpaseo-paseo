import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { createAgentInRepo, ensureHostSelected, gotoHome } from "./helpers/app";
import { createTempGitRepo } from "./helpers/workspace";
import {
  ensureWorkspaceAgentPaneVisible,
  getWorkspaceTabTestIds,
  sampleWorkspaceTabIds,
  waitForWorkspaceTabsVisible,
} from "./helpers/workspace-tabs";
import { switchWorkspaceViaSidebar } from "./helpers/workspace-ui";
import { buildHostWorkspaceRouteWithOpenIntent } from "@/utils/host-routes";

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

test("workspace draft tabs keep separate prompt state", async ({ page }) => {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error("E2E_SERVER_ID is not set.");
  }

  const repo = await createTempGitRepo("paseo-e2e-draft-isolation-");
  const seedPrompt = `seed isolation ${Date.now()}`;
  const firstDraftPrompt = `first draft ${Date.now()}`;
  const secondDraftPrompt = `second draft ${Date.now()}`;

  try {
    await createAgentInRepo(page, { directory: repo.path, prompt: seedPrompt });

    await switchWorkspaceViaSidebar({ page, serverId, targetWorkspacePath: repo.path });
    await waitForWorkspaceTabsVisible(page);
    await ensureWorkspaceAgentPaneVisible(page);

    const beforeFirstDraftIds = await getWorkspaceTabTestIds(page);
    await page.getByTestId("workspace-new-agent-tab").first().click();
    await expectComposerFocused(page);

    const withFirstDraftIds = await getWorkspaceTabTestIds(page);
    const firstDraftTabTestId = withFirstDraftIds.find((id) => !beforeFirstDraftIds.includes(id));
    if (!firstDraftTabTestId) {
      throw new Error("Expected first draft tab to be created.");
    }

    const composer = page.getByRole("textbox", { name: "Message agent..." }).first();
    await composer.fill(firstDraftPrompt);

    const beforeSecondDraftIds = await getWorkspaceTabTestIds(page);
    await page.getByTestId("workspace-new-agent-tab").first().click();
    await expectComposerFocused(page);

    const withSecondDraftIds = await getWorkspaceTabTestIds(page);
    const secondDraftTabTestId = withSecondDraftIds.find((id) => !beforeSecondDraftIds.includes(id));
    if (!secondDraftTabTestId) {
      throw new Error("Expected second draft tab to be created.");
    }

    await composer.fill(secondDraftPrompt);

    await page.getByTestId(firstDraftTabTestId).first().click();
    await expect(composer).toHaveValue(firstDraftPrompt);

    await page.getByTestId(secondDraftTabTestId).first().click();
    await expect(composer).toHaveValue(secondDraftPrompt);
  } finally {
    await repo.cleanup();
  }
});

test("workspace draft promotion does not steal focus from another tab", async ({ page }) => {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error("E2E_SERVER_ID is not set.");
  }

  const repo = await createTempGitRepo("paseo-e2e-draft-no-focus-steal-");
  const seedPrompt = `seed focus ${Date.now()}`;
  const createPrompt = `background create ${Date.now()}`;

  try {
    await createAgentInRepo(page, { directory: repo.path, prompt: seedPrompt });

    await switchWorkspaceViaSidebar({ page, serverId, targetWorkspacePath: repo.path });
    await waitForWorkspaceTabsVisible(page);
    await ensureWorkspaceAgentPaneVisible(page);

    const beforeDraftIds = await getWorkspaceTabTestIds(page);
    const firstAgentTabTestId = beforeDraftIds.find((id) => id.startsWith("workspace-tab-agent_"));
    if (!firstAgentTabTestId) {
      throw new Error("Expected an existing agent tab.");
    }

    await page.getByTestId("workspace-new-agent-tab").first().click();
    await expect(page.getByRole("textbox", { name: "Message agent..." }).first()).toBeEditable();

    const withDraftIds = await getWorkspaceTabTestIds(page);
    const draftTabTestId = withDraftIds.find((id) => !beforeDraftIds.includes(id));
    if (!draftTabTestId) {
      throw new Error("Expected a draft tab to be created.");
    }

    const draftId = draftTabTestId.replace("workspace-tab-", "");
    const draftCloseButton = page.getByTestId(`workspace-draft-close-${draftId}`).first();
    const composer = page.getByRole("textbox", { name: "Message agent..." }).first();
    await composer.fill(createPrompt);
    await composer.press("Enter");
    await page.getByTestId(firstAgentTabTestId).first().click();

    await expect(page.getByText(seedPrompt, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(draftCloseButton).not.toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(createPrompt, { exact: true }).first()).not.toBeVisible();
    await expect(page.getByText(seedPrompt, { exact: true }).first()).toBeVisible();
  } finally {
    await repo.cleanup();
  }
});

test("workspace open intent creates exactly one draft tab in an empty workspace", async ({ page }) => {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error("E2E_SERVER_ID is not set.");
  }

  const repo = await createTempGitRepo("paseo-e2e-draft-open-intent-");

  try {
    await gotoHome(page);
    await ensureHostSelected(page);

    await page.goto(
      buildHostWorkspaceRouteWithOpenIntent(serverId, repo.path, {
        kind: "draft",
        draftId: "new",
      })
    );

    await waitForWorkspaceTabsVisible(page);
    await ensureWorkspaceAgentPaneVisible(page);
    await expect(page.getByRole("textbox", { name: "Message agent..." }).first()).toBeEditable();

    const tabIds = await getWorkspaceTabTestIds(page);
    expect(tabIds).toHaveLength(1);
    expect(tabIds[0]?.startsWith("workspace-tab-draft_")).toBe(true);

    const tabLabel = page
      .locator('[data-testid^="workspace-tab-"]:not([data-testid^="workspace-tab-context-"])')
      .first();
    await expect(tabLabel).toContainText("New Agent");
  } finally {
    await repo.cleanup();
  }
});
