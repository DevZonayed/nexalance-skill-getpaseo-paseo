import { execSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "./fixtures";
import {
  clickNewTabButton,
  clickTerminal,
  gotoWorkspace,
  waitForLauncherPanel,
} from "./helpers/launcher";
import {
  setupDeterministicPrompt,
  waitForTerminalContent,
} from "./helpers/terminal-perf";
import { createTempGitRepo } from "./helpers/workspace";
import { connectWorkspaceSetupClient, seedProjectForWorkspaceSetup } from "./helpers/workspace-setup";

test.describe("Workspace cwd correctness", () => {
  test("main checkout workspace opens terminals in the project root", async ({ page }) => {
    test.setTimeout(60_000);

    const client = await connectWorkspaceSetupClient();
    const repo = await createTempGitRepo("workspace-cwd-main-");

    try {
      await seedProjectForWorkspaceSetup(client, repo.path);

      const workspaceResult = await client.openProject(repo.path);
      if (!workspaceResult.workspace) {
        throw new Error(workspaceResult.error ?? `Failed to open project ${repo.path}`);
      }
      const workspaceId = String(workspaceResult.workspace.id);

      await gotoWorkspace(page, workspaceId);
      await clickNewTabButton(page);
      await waitForLauncherPanel(page);
      await clickTerminal(page);

      const terminal = page.locator('[data-testid="terminal-surface"]');
      await expect(terminal.first()).toBeVisible({ timeout: 20_000 });
      await terminal.first().click();

      await setupDeterministicPrompt(page, `PWD_READY_${Date.now()}`);
      await terminal.first().pressSequentially("pwd\n", { delay: 0 });

      await waitForTerminalContent(page, (text) => text.includes(repo.path), 10_000);
    } finally {
      await client.close();
      await repo.cleanup();
    }
  });

  test("worktree workspace opens terminals in the worktree directory", async ({ page }) => {
    test.setTimeout(90_000);

    const client = await connectWorkspaceSetupClient();
    const repo = await createTempGitRepo("workspace-cwd-worktree-");
    const worktreePath = path.join(
      "/tmp",
      `paseo-wt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const branchName = `workspace-cwd-${Date.now()}`;
    let worktreeCreated = false;

    try {
      await seedProjectForWorkspaceSetup(client, repo.path);

      execSync(`git worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify(branchName)} main`, {
        cwd: repo.path,
        stdio: "ignore",
      });
      worktreeCreated = true;

      const workspaceResult = await client.openProject(worktreePath);
      if (!workspaceResult.workspace) {
        throw new Error(workspaceResult.error ?? `Failed to open project ${worktreePath}`);
      }
      const workspaceId = String(workspaceResult.workspace.id);

      await gotoWorkspace(page, workspaceId);
      await clickNewTabButton(page);
      await waitForLauncherPanel(page);
      await clickTerminal(page);

      const terminal = page.locator('[data-testid="terminal-surface"]');
      await expect(terminal.first()).toBeVisible({ timeout: 20_000 });
      await terminal.first().click();

      await setupDeterministicPrompt(page, `PWD_READY_${Date.now()}`);
      await terminal.first().pressSequentially("pwd\n", { delay: 0 });
      await waitForTerminalContent(page, (text) => text.includes(worktreePath), 10_000);
    } finally {
      if (worktreeCreated) {
        try {
          execSync(`git worktree remove ${JSON.stringify(worktreePath)} --force`, {
            cwd: repo.path,
            stdio: "ignore",
          });
        } catch {
          // Best-effort cleanup so test failures preserve the original error.
        }
      }
      await client.close();
      await repo.cleanup();
    }
  });

});
