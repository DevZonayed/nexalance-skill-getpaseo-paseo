import { existsSync } from "node:fs";
import { expect, test } from "./fixtures";
import { createTempGitRepo } from "./helpers/workspace";
import {
  connectWorkspaceSetupClient,
  createChatAgentFromWorkspaceSetup,
  createStandaloneTerminalFromWorkspaceSetup,
  createWorkspaceFromSidebar,
  findWorktreeWorkspaceForProject,
  openHomeWithProject,
  type WorkspaceSetupDaemonClient,
} from "./helpers/workspace-setup";

async function openWorkspaceSetupDialogFromSidebar(
  page: import("@playwright/test").Page,
  repoPath: string,
): Promise<void> {
  await openHomeWithProject(page, repoPath);
  await createWorkspaceFromSidebar(page, repoPath);
}

async function expectCreatedWorkspaceRoute(
  client: WorkspaceSetupDaemonClient,
  originalProjectPath: string,
) {
  await expect
    .poll(
      async () => {
        try {
          return await findWorktreeWorkspaceForProject(client, originalProjectPath);
        } catch {
          return null;
        }
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();

  const workspace = await findWorktreeWorkspaceForProject(client, originalProjectPath);

  expect(workspace.workspaceDirectory).not.toBe(originalProjectPath);
  expect(existsSync(workspace.workspaceDirectory)).toBe(true);
  return workspace;
}

async function waitForNewWorkspaceAgent(
  client: WorkspaceSetupDaemonClient,
  expectedWorkspaceDirectory: string,
  agentIdsBefore: Set<string>,
) {
  await expect
    .poll(
      async () => {
        const payload = await client.fetchAgents();
        return (
          payload.entries.find(
            (entry) =>
              !agentIdsBefore.has(entry.agent.id) &&
              entry.agent.cwd === expectedWorkspaceDirectory,
          )?.agent ?? null
        );
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();

  const payload = await client.fetchAgents();
  const agent =
    payload.entries.find(
      (entry) =>
        !agentIdsBefore.has(entry.agent.id) && entry.agent.cwd === expectedWorkspaceDirectory,
    )?.agent ?? null;
  if (!agent) {
    throw new Error(`Expected a new agent for workspace ${expectedWorkspaceDirectory}`);
  }
  return agent;
}

test.describe("Workspace setup runtime authority", () => {
  test.describe.configure({ retries: 1 });

  test("first chat agent attaches to the created workspace", async ({ page }) => {
    test.setTimeout(90_000);

    const client = await connectWorkspaceSetupClient();
    const repo = await createTempGitRepo("workspace-setup-chat-");

    try {
      await client.openProject(repo.path);
      await openWorkspaceSetupDialogFromSidebar(page, repo.path);
      const agentIdsBefore = new Set((await client.fetchAgents()).entries.map((entry) => entry.agent.id));

      await createChatAgentFromWorkspaceSetup(page, {
        message: `workspace-setup-chat-${Date.now()}`,
      });

      const workspace = await expectCreatedWorkspaceRoute(client, repo.path);
      const agent = await waitForNewWorkspaceAgent(
        client,
        workspace.workspaceDirectory,
        agentIdsBefore,
      );
      expect(agent.cwd).toBe(workspace.workspaceDirectory);
      expect(agent.cwd).not.toBe(repo.path);
    } finally {
      await client.close();
      await repo.cleanup();
    }
  });

  test("first terminal attaches to the created workspace", async ({ page }) => {
    test.setTimeout(90_000);

    const client = await connectWorkspaceSetupClient();
    const repo = await createTempGitRepo("workspace-setup-terminal-");

    try {
      await client.openProject(repo.path);
      await openWorkspaceSetupDialogFromSidebar(page, repo.path);

      await createStandaloneTerminalFromWorkspaceSetup(page);

      const workspace = await expectCreatedWorkspaceRoute(client, repo.path);

      await expect
        .poll(
          async () =>
            (await client.listTerminals(workspace.workspaceDirectory)).terminals.length > 0,
          { timeout: 30_000 },
        )
        .toBe(true);
      expect(
        (await client.listTerminals(repo.path)).terminals.length,
      ).toBe(0);
    } finally {
      await client.close();
      await repo.cleanup();
    }
  });
});
