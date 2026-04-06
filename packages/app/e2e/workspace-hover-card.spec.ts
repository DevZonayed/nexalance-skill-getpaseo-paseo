import { test, expect } from "./fixtures";
import { createTempGitRepo } from "./helpers/workspace";
import { waitForWorkspaceTabsVisible } from "./helpers/workspace-tabs";
import {
  connectWorkspaceSetupClient,
  createWorkspaceThroughDaemon,
  openHomeWithProject,
  seedProjectForWorkspaceSetup,
  waitForWorkspaceSetupProgress,
} from "./helpers/workspace-setup";
import type { Page } from "@playwright/test";

function getServerId(): string {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error("E2E_SERVER_ID is not set.");
  }
  return serverId;
}

// ---------------------------------------------------------------------------
// Composable helpers
// ---------------------------------------------------------------------------

/** Waits for the globe icon to appear on a workspace row (proves services are running). */
async function expectGlobeIcon(page: Page): Promise<void> {
  await expect(page.getByTestId("workspace-globe-icon")).toBeVisible({ timeout: 30_000 });
}

/** Hovers the workspace row (by visible name) and waits for the hover card to appear. */
async function expectHoverCard(page: Page, workspaceName: string): Promise<void> {
  const row = page.getByRole("button", { name: workspaceName }).first();
  await row.hover();
  await expect(page.getByTestId("workspace-hover-card")).toBeVisible({ timeout: 10_000 });
}

/** Asserts that a service row with the given name exists in the hover card. */
async function expectServiceInCard(page: Page, serviceName: string): Promise<void> {
  const card = page.getByTestId("workspace-hover-card");
  await expect(card.getByTestId(`hover-card-service-${serviceName}`)).toBeVisible({
    timeout: 10_000,
  });
}

/** Asserts the service status dot indicates "running". */
async function expectServiceRunning(page: Page, serviceName: string): Promise<void> {
  const card = page.getByTestId("workspace-hover-card");
  await expect(
    card.getByTestId(`hover-card-service-status-${serviceName}`),
  ).toHaveAttribute("aria-label", "Running", { timeout: 10_000 });
}

/** Asserts the hover card contains the workspace name. */
async function expectWorkspaceNameInCard(page: Page, name: string): Promise<void> {
  const card = page.getByTestId("workspace-hover-card");
  await expect(card.getByTestId("hover-card-workspace-name")).toContainText(name, {
    timeout: 10_000,
  });
}

/** Moves the mouse away from the sidebar and asserts the hover card disappears. */
async function expectHoverCardDismissed(page: Page): Promise<void> {
  // Move mouse to the center of the viewport (away from sidebar)
  const viewport = page.viewportSize();
  await page.mouse.move((viewport?.width ?? 1280) / 2, (viewport?.height ?? 720) / 2);
  await expect(page.getByTestId("workspace-hover-card")).not.toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Workspace hover card", () => {
  test("shows hover card with services when hovering a workspace with running services", async ({
    page,
  }) => {
    const client = await connectWorkspaceSetupClient();
    const repo = await createTempGitRepo("hovercard-svc-", {
      paseoConfig: {
        worktree: {
          setup: ["sh -c 'echo bootstrapping; sleep 1; echo setup complete'"],
        },
        services: {
          web: {
            command:
              "node -e \"const http = require('http'); const s = http.createServer((q,r) => r.end('ok')); s.listen(process.env.PORT || 3000, () => console.log('listening on ' + s.address().port))\"",
          },
        },
      },
    });

    try {
      await seedProjectForWorkspaceSetup(client, repo.path);

      // Wait for setup completion via daemon (setup snapshots are per-session)
      const completed = waitForWorkspaceSetupProgress(
        client,
        (payload) => payload.status === "completed" && payload.detail.log.includes("setup complete"),
      );
      const workspace = await createWorkspaceThroughDaemon(client, {
        cwd: repo.path,
        worktreeSlug: `hovercard-${Date.now()}`,
      });
      await completed;

      await openHomeWithProject(page, repo.path);
      const wsRow = page.getByTestId(`sidebar-workspace-row-${getServerId()}:${workspace.id}`);
      await expect(wsRow).toBeVisible({ timeout: 30_000 });
      await wsRow.click();
      await expect(page).toHaveURL(/\/workspace\//, { timeout: 30_000 });

      await waitForWorkspaceTabsVisible(page);

      // Wait for the globe icon — proves services are running and client has the data
      await expectGlobeIcon(page);

      // Hover the workspace row — hover card should appear
      await expectHoverCard(page, workspace.name);

      // Assert the card shows the workspace name
      await expectWorkspaceNameInCard(page, workspace.name);

      // Assert the "web" service entry exists in the card
      await expectServiceInCard(page, "web");

      // Assert the status dot shows "running"
      await expectServiceRunning(page, "web");

      // Assert the service row is a link (has role="link")
      const card = page.getByTestId("workspace-hover-card");
      const serviceLink = card.getByRole("link", { name: "web service" });
      await expect(serviceLink).toBeVisible({ timeout: 10_000 });

      // Move mouse away — card should dismiss
      await expectHoverCardDismissed(page);
    } finally {
      await client.close();
      await repo.cleanup();
    }
  });
});
