import { expect, type Page } from "@playwright/test";
import {
  clickNewChat,
  clickTerminal,
  countTabsOfKind,
  getTabTestIds,
} from "./launcher";
import { setupDeterministicPrompt, waitForTerminalContent } from "./terminal-perf";

function terminalSurface(page: Page) {
  return page.locator('[data-testid="terminal-surface"]').first();
}

function composerInput(page: Page) {
  return page.getByRole("textbox", { name: "Message agent..." }).first();
}

export async function expectTerminalCwd(page: Page, expectedPath: string): Promise<void> {
  const terminal = terminalSurface(page);
  await expect(terminal).toBeVisible({ timeout: 20_000 });
  await terminal.click();
  await setupDeterministicPrompt(page, `SENTINEL_${Date.now()}`);
  await terminal.pressSequentially("pwd\n", { delay: 0 });
  await waitForTerminalContent(page, (text) => text.includes(expectedPath), 10_000);
}

export async function createStandaloneTerminalFromLauncher(page: Page): Promise<void> {
  const tabIdsBefore = await getTabTestIds(page);
  const launcherCountBefore = await countTabsOfKind(page, "launcher");
  await clickTerminal(page);
  await expect(terminalSurface(page)).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => countTabsOfKind(page, "launcher")).toBe(launcherCountBefore - 1);
  await expect.poll(async () => (await getTabTestIds(page)).length).toBe(tabIdsBefore.length);
}

export async function createAgentChatFromLauncher(page: Page): Promise<void> {
  await clickNewChat(page);
  await expect(composerInput(page)).toBeVisible({ timeout: 15_000 });
  await expect(composerInput(page)).toBeEditable({ timeout: 15_000 });
  await expect(page.getByTestId("agent-loading")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New Chat" })).toHaveCount(0);
}
