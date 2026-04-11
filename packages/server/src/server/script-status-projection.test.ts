import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { ScriptRouteStore } from "./script-proxy.js";
import {
  buildWorkspaceScriptPayloads,
  createScriptStatusEmitter,
} from "./script-status-projection.js";
import type { ScriptHealthState } from "./script-health-monitor.js";
import { WorkspaceScriptRuntimeStore } from "./workspace-script-runtime-store.js";

function createWorkspaceRepo(options?: {
  branchName?: string;
  paseoConfig?: Record<string, unknown>;
}): { tempDir: string; repoDir: string; cleanup: () => void } {
  const tempDir = realpathSync(mkdtempSync(path.join(tmpdir(), "script-projection-")));
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

function buildPayloads(input: {
  workspaceDirectory: string;
  routeStore: ScriptRouteStore;
  runtimeStore: WorkspaceScriptRuntimeStore;
  daemonPort: number | null;
  resolveHealth?: (hostname: string) => ScriptHealthState | null;
}) {
  return buildWorkspaceScriptPayloads(input);
}

describe("script-status-projection", () => {
  it("projects plain scripts and services differently", () => {
    const workspace = createWorkspaceRepo({
      paseoConfig: {
        scripts: {
          typecheck: { command: "npm run typecheck" },
          web: { type: "service", command: "npm run web", port: 3000 },
        },
      },
    });
    const routeStore = new ScriptRouteStore();
    const runtimeStore = new WorkspaceScriptRuntimeStore();
    runtimeStore.set({
      workspaceId: workspace.repoDir,
      scriptName: "typecheck",
      type: "script",
      lifecycle: "stopped",
      terminalId: "term-script",
      exitCode: 0,
    });

    try {
      expect(
        buildPayloads({
          workspaceDirectory: workspace.repoDir,
          routeStore,
          runtimeStore,
          daemonPort: 6767,
        }),
      ).toEqual([
        {
          scriptName: "typecheck",
          type: "script",
          hostname: "typecheck",
          port: null,
          proxyUrl: null,
          lifecycle: "stopped",
          health: null,
          exitCode: 0,
        },
        {
          scriptName: "web",
          type: "service",
          hostname: "web.localhost",
          port: 3000,
          proxyUrl: "http://web.localhost:6767",
          lifecycle: "stopped",
          health: null,
          exitCode: null,
        },
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it("overlays runtime, route, and health state for running services", () => {
    const workspace = createWorkspaceRepo({
      branchName: "feature/card",
      paseoConfig: {
        scripts: {
          web: { type: "service", command: "npm run web" },
        },
      },
    });
    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "feature-card.web.localhost",
      port: 4321,
      workspaceId: workspace.repoDir,
      scriptName: "web",
    });
    const runtimeStore = new WorkspaceScriptRuntimeStore();
    runtimeStore.set({
      workspaceId: workspace.repoDir,
      scriptName: "web",
      type: "service",
      lifecycle: "running",
      terminalId: "term-web",
      exitCode: null,
    });

    try {
      expect(
        buildPayloads({
          workspaceDirectory: workspace.repoDir,
          routeStore,
          runtimeStore,
          daemonPort: 6767,
          resolveHealth: () => "healthy",
        }),
      ).toEqual([
        {
          scriptName: "web",
          type: "service",
          hostname: "feature-card.web.localhost",
          port: 4321,
          proxyUrl: "http://feature-card.web.localhost:6767",
          lifecycle: "running",
          health: "healthy",
          exitCode: null,
        },
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it("maps internal pending health to null on the wire", () => {
    const workspace = createWorkspaceRepo({
      paseoConfig: {
        scripts: {
          web: { type: "service", command: "npm run web" },
        },
      },
    });
    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "web.localhost",
      port: 4321,
      workspaceId: workspace.repoDir,
      scriptName: "web",
    });
    const runtimeStore = new WorkspaceScriptRuntimeStore();
    runtimeStore.set({
      workspaceId: workspace.repoDir,
      scriptName: "web",
      type: "service",
      lifecycle: "running",
      terminalId: "term-web",
      exitCode: null,
    });

    try {
      expect(
        buildPayloads({
          workspaceDirectory: workspace.repoDir,
          routeStore,
          runtimeStore,
          daemonPort: 6767,
          resolveHealth: () => "pending",
        }),
      ).toEqual([
        {
          scriptName: "web",
          type: "service",
          hostname: "web.localhost",
          port: 4321,
          proxyUrl: "http://web.localhost:6767",
          lifecycle: "running",
          health: null,
          exitCode: null,
        },
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it("includes orphaned running runtime entries even after config removal", () => {
    const workspace = createWorkspaceRepo();
    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "docs.localhost",
      port: 3002,
      workspaceId: workspace.repoDir,
      scriptName: "docs",
    });
    const runtimeStore = new WorkspaceScriptRuntimeStore();
    runtimeStore.set({
      workspaceId: workspace.repoDir,
      scriptName: "docs",
      type: "service",
      lifecycle: "running",
      terminalId: "term-docs",
      exitCode: null,
    });

    try {
      expect(
        buildPayloads({
          workspaceDirectory: workspace.repoDir,
          routeStore,
          runtimeStore,
          daemonPort: 6767,
        }),
      ).toEqual([
        {
          scriptName: "docs",
          type: "service",
          hostname: "docs.localhost",
          port: 3002,
          proxyUrl: "http://docs.localhost:6767",
          lifecycle: "running",
          health: null,
          exitCode: null,
        },
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it("projects orphaned plain scripts as scripts instead of services", () => {
    const workspace = createWorkspaceRepo();
    const routeStore = new ScriptRouteStore();
    const runtimeStore = new WorkspaceScriptRuntimeStore();
    runtimeStore.set({
      workspaceId: workspace.repoDir,
      scriptName: "typecheck",
      type: "script",
      lifecycle: "running",
      terminalId: "term-typecheck",
      exitCode: null,
    });

    try {
      expect(
        buildPayloads({
          workspaceDirectory: workspace.repoDir,
          routeStore,
          runtimeStore,
          daemonPort: 6767,
        }),
      ).toEqual([
        {
          scriptName: "typecheck",
          type: "script",
          hostname: "typecheck",
          port: null,
          proxyUrl: null,
          lifecycle: "running",
          health: null,
          exitCode: null,
        },
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it("createScriptStatusEmitter overlays health onto the projected workspace script list", () => {
    const workspace = createWorkspaceRepo({
      paseoConfig: {
        scripts: {
          api: { type: "service", command: "npm run api" },
          typecheck: { command: "npm run typecheck" },
        },
      },
    });
    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: 3001,
      workspaceId: workspace.repoDir,
      scriptName: "api",
    });
    const runtimeStore = new WorkspaceScriptRuntimeStore();
    runtimeStore.set({
      workspaceId: workspace.repoDir,
      scriptName: "api",
      type: "service",
      lifecycle: "running",
      terminalId: "term-api",
      exitCode: null,
    });

    const session = { emit: vi.fn() };
    const emitUpdate = createScriptStatusEmitter({
      sessions: () => [session],
      routeStore,
      runtimeStore,
      daemonPort: 6767,
    });

    try {
      emitUpdate(workspace.repoDir, [
        {
          scriptName: "api",
          hostname: "api.localhost",
          port: 3001,
          health: "healthy",
        },
      ]);

      expect(session.emit).toHaveBeenCalledWith({
        type: "script_status_update",
        payload: {
          workspaceId: workspace.repoDir,
          scripts: [
            {
              scriptName: "api",
              type: "service",
              hostname: "api.localhost",
              port: 3001,
              proxyUrl: "http://api.localhost:6767",
              lifecycle: "running",
              health: "healthy",
              exitCode: null,
            },
            {
              scriptName: "typecheck",
              type: "script",
              hostname: "typecheck",
              port: null,
              proxyUrl: null,
              lifecycle: "stopped",
              health: null,
              exitCode: null,
            },
          ],
        },
      });
    } finally {
      workspace.cleanup();
    }
  });
});
