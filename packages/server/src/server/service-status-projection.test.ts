import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { ServiceRouteStore } from "./service-proxy.js";
import {
  buildWorkspaceServicePayloads,
  createServiceStatusEmitter,
} from "./service-status-projection.js";

function createWorkspaceRepo(options?: {
  branchName?: string;
  paseoConfig?: Record<string, unknown>;
}): { tempDir: string; repoDir: string; cleanup: () => void } {
  const tempDir = realpathSync(mkdtempSync(path.join(tmpdir(), "service-projection-")));
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

describe("service-status-projection", () => {
  it("shows configured services even before they have routes", () => {
    const workspace = createWorkspaceRepo({
      paseoConfig: {
        services: {
          api: { command: "npm run api" },
          web: { command: "npm run web", port: 3000 },
        },
      },
    });
    const routeStore = new ServiceRouteStore();

    try {
      expect(buildWorkspaceServicePayloads(routeStore, workspace.repoDir, 6767)).toEqual([
        {
          serviceName: "api",
          hostname: "api.localhost",
          port: null,
          url: "http://api.localhost:6767",
          lifecycle: "stopped",
          health: null,
        },
        {
          serviceName: "web",
          hostname: "web.localhost",
          port: 3000,
          url: "http://web.localhost:6767",
          lifecycle: "stopped",
          health: null,
        },
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it("uses the active route port and branch-aware hostname for running services", () => {
    const workspace = createWorkspaceRepo({
      branchName: "feature/card",
      paseoConfig: {
        services: {
          web: { command: "npm run web" },
        },
      },
    });
    const routeStore = new ServiceRouteStore();
    routeStore.registerRoute({
      hostname: "feature-card.web.localhost",
      port: 4321,
      workspaceId: workspace.repoDir,
      serviceName: "web",
    });

    try {
      expect(buildWorkspaceServicePayloads(routeStore, workspace.repoDir, 6767)).toEqual([
        {
          serviceName: "web",
          hostname: "feature-card.web.localhost",
          port: 4321,
          url: "http://feature-card.web.localhost:6767",
          lifecycle: "running",
          health: null,
        },
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it("includes orphaned active routes even if the current config no longer declares them", () => {
    const workspace = createWorkspaceRepo();
    const routeStore = new ServiceRouteStore();
    routeStore.registerRoute({
      hostname: "docs.localhost",
      port: 3002,
      workspaceId: workspace.repoDir,
      serviceName: "docs",
    });

    try {
      expect(buildWorkspaceServicePayloads(routeStore, workspace.repoDir, 6767)).toEqual([
        {
          serviceName: "docs",
          hostname: "docs.localhost",
          port: 3002,
          url: "http://docs.localhost:6767",
          lifecycle: "running",
          health: null,
        },
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it("createServiceStatusEmitter overlays health onto the full workspace service list", () => {
    const workspace = createWorkspaceRepo({
      paseoConfig: {
        services: {
          api: { command: "npm run api" },
          web: { command: "npm run web" },
        },
      },
    });
    const routeStore = new ServiceRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: 3001,
      workspaceId: workspace.repoDir,
      serviceName: "api",
    });

    const session = { emit: vi.fn() };
    const emitUpdate = createServiceStatusEmitter({
      sessions: () => [session],
      routeStore,
      daemonPort: 6767,
    });

    try {
      emitUpdate(workspace.repoDir, [
        {
          serviceName: "api",
          hostname: "api.localhost",
          port: 3001,
          health: "healthy",
        },
      ]);

      expect(session.emit).toHaveBeenCalledWith({
        type: "service_status_update",
        payload: {
          workspaceId: workspace.repoDir,
          services: [
            {
              serviceName: "api",
              hostname: "api.localhost",
              port: 3001,
              url: "http://api.localhost:6767",
              lifecycle: "running",
              health: "healthy",
            },
            {
              serviceName: "web",
              hostname: "web.localhost",
              port: null,
              url: "http://web.localhost:6767",
              lifecycle: "stopped",
              health: null,
            },
          ],
        },
      });
    } finally {
      workspace.cleanup();
    }
  });

  it("computes URLs with and without a daemon port", () => {
    const workspace = createWorkspaceRepo({
      paseoConfig: {
        services: {
          api: { command: "npm run api" },
        },
      },
    });
    const routeStore = new ServiceRouteStore();

    try {
      expect(buildWorkspaceServicePayloads(routeStore, workspace.repoDir, 6767)).toEqual([
        {
          serviceName: "api",
          hostname: "api.localhost",
          port: null,
          url: "http://api.localhost:6767",
          lifecycle: "stopped",
          health: null,
        },
      ]);

      expect(buildWorkspaceServicePayloads(routeStore, workspace.repoDir, null)).toEqual([
        {
          serviceName: "api",
          hostname: "api.localhost",
          port: null,
          url: null,
          lifecycle: "stopped",
          health: null,
        },
      ]);
    } finally {
      workspace.cleanup();
    }
  });
});
