import { execSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ScriptRouteStore } from "./script-proxy.js";
import { createBranchChangeRouteHandler } from "./script-route-branch-handler.js";

function createWorkspaceRepo(options?: {
  branchName?: string;
  paseoConfig?: Record<string, unknown>;
}): { tempDir: string; repoDir: string; cleanup: () => void } {
  const tempDir = realpathSync(mkdtempSync(path.join(tmpdir(), "script-branch-handler-")));
  const repoDir = path.join(tempDir, "repo");
  execSync(`mkdir -p ${JSON.stringify(repoDir)}`);
  execSync(`git init -b ${options?.branchName ?? "main"}`, { cwd: repoDir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: repoDir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: repoDir, stdio: "pipe" });
  writeFileSync(path.join(repoDir, "README.md"), "hello\n");
  if (options?.paseoConfig) {
    writeFileSync(path.join(repoDir, "paseo.json"), JSON.stringify(options.paseoConfig, null, 2));
  }
  execSync("git add .", { cwd: repoDir, stdio: "pipe" });
  execSync("git -c commit.gpgsign=false commit -m 'initial'", { cwd: repoDir, stdio: "pipe" });

  return {
    tempDir,
    repoDir,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function registerRoute(
  routeStore: ScriptRouteStore,
  {
    hostname,
    port,
    workspaceId = "workspace-a",
    scriptName,
  }: {
    hostname: string;
    port: number;
    workspaceId?: string;
    scriptName: string;
  },
): void {
  routeStore.registerRoute({
    hostname,
    port,
    workspaceId,
    scriptName,
  });
}

describe("script-route-branch-handler", () => {
  it("updates routes on branch rename by removing old hostnames and registering new ones", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      scriptName: "api",
    });

    const onRoutesChanged = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      onRoutesChanged,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(routeStore.findRoute("feature-auth.api.localhost")).toBeNull();
    expect(routeStore.findRoute("feature-billing.api.localhost")).toEqual({
      hostname: "feature-billing.api.localhost",
      port: 3001,
    });
  });

  it("is a no-op when the workspace has no routes", () => {
    const routeStore = new ScriptRouteStore();
    const onRoutesChanged = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      onRoutesChanged,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(routeStore.listRoutes()).toEqual([]);
    expect(onRoutesChanged).not.toHaveBeenCalled();
  });

  it("is a no-op when the resolved hostnames do not change", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "api.localhost",
      port: 3001,
      scriptName: "api",
    });

    const onRoutesChanged = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      onRoutesChanged,
    });

    handleBranchChange("workspace-a", "main", "master");

    expect(routeStore.listRoutesForWorkspace("workspace-a")).toEqual([
      {
        hostname: "api.localhost",
        port: 3001,
        workspaceId: "workspace-a",
        scriptName: "api",
      },
    ]);
    expect(onRoutesChanged).not.toHaveBeenCalled();
  });

  it("triggers shared reprojection after a route change", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      scriptName: "api",
    });

    const onRoutesChanged = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      onRoutesChanged,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(onRoutesChanged).toHaveBeenCalledWith("workspace-a");
  });

  it("updates all services for a workspace when multiple routes are registered", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      scriptName: "api",
    });
    registerRoute(routeStore, {
      hostname: "feature-auth.web.localhost",
      port: 3002,
      scriptName: "web",
    });
    registerRoute(routeStore, {
      hostname: "docs.localhost",
      port: 3003,
      workspaceId: "workspace-b",
      scriptName: "docs",
    });

    const onRoutesChanged = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      onRoutesChanged,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(routeStore.listRoutesForWorkspace("workspace-a")).toEqual([
      {
        hostname: "feature-billing.api.localhost",
        port: 3001,
        workspaceId: "workspace-a",
        scriptName: "api",
      },
      {
        hostname: "feature-billing.web.localhost",
        port: 3002,
        workspaceId: "workspace-a",
        scriptName: "web",
      },
    ]);
    expect(routeStore.listRoutesForWorkspace("workspace-b")).toEqual([
      {
        hostname: "docs.localhost",
        port: 3003,
        workspaceId: "workspace-b",
        scriptName: "docs",
      },
    ]);
  });

  it("does not emit a status update when no changes are needed", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "web.localhost",
      port: 3002,
      scriptName: "web",
    });

    const onRoutesChanged = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      onRoutesChanged,
    });

    handleBranchChange("workspace-a", null, "main");

    expect(onRoutesChanged).not.toHaveBeenCalled();
  });

  it("renames only service routes and leaves plain scripts unaffected", () => {
    const workspace = createWorkspaceRepo({
      branchName: "feature/auth",
      paseoConfig: {
        scripts: {
          api: { type: "service", command: "npm run api" },
          typecheck: { command: "npm run typecheck" },
        },
      },
    });
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      workspaceId: workspace.repoDir,
      scriptName: "api",
    });

    const onRoutesChanged = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      onRoutesChanged,
    });

    try {
      handleBranchChange(workspace.repoDir, "feature/auth", "feature/billing");

      expect(routeStore.listRoutesForWorkspace(workspace.repoDir)).toEqual([
        {
          hostname: "feature-billing.api.localhost",
          port: 3001,
          workspaceId: workspace.repoDir,
          scriptName: "api",
        },
      ]);
      expect(onRoutesChanged).toHaveBeenCalledWith(workspace.repoDir);
    } finally {
      workspace.cleanup();
    }
  });
});
