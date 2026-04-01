import { execSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi, afterEach } from "vitest";
import {
  createPersistedProjectRecord,
  createPersistedWorkspaceRecord,
} from "./workspace-registry.js";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "./workspace-registry.js";
import { WorkspaceReconciliationService } from "./workspace-reconciliation-service.js";

function createTestRegistries() {
  const projects = new Map<number, PersistedProjectRecord>();
  const workspaces = new Map<number, PersistedWorkspaceRecord>();
  let nextProjectId = 1;
  let nextWorkspaceId = 1;

  const projectRegistry = {
    initialize: async () => {},
    existsOnDisk: async () => true,
    list: async () => Array.from(projects.values()),
    get: async (id: number) => projects.get(id) ?? null,
    insert: async (record: Omit<PersistedProjectRecord, "id">) => {
      const id = nextProjectId++;
      projects.set(id, createPersistedProjectRecord({ id, ...record }));
      return id;
    },
    upsert: async (record: PersistedProjectRecord) => {
      projects.set(record.id, record);
    },
    archive: async (id: number, archivedAt: string) => {
      const existing = projects.get(id);
      if (existing) {
        projects.set(id, { ...existing, archivedAt, updatedAt: archivedAt });
      }
    },
    remove: async (id: number) => {
      projects.delete(id);
    },
  };

  const workspaceRegistry = {
    initialize: async () => {},
    existsOnDisk: async () => true,
    list: async () => Array.from(workspaces.values()),
    get: async (id: number) => workspaces.get(id) ?? null,
    insert: async (record: Omit<PersistedWorkspaceRecord, "id">) => {
      const id = nextWorkspaceId++;
      workspaces.set(id, createPersistedWorkspaceRecord({ id, ...record }));
      return id;
    },
    upsert: async (record: PersistedWorkspaceRecord) => {
      workspaces.set(record.id, record);
    },
    archive: async (id: number, archivedAt: string) => {
      const existing = workspaces.get(id);
      if (existing) {
        workspaces.set(id, { ...existing, archivedAt, updatedAt: archivedAt });
      }
    },
    remove: async (id: number) => {
      workspaces.delete(id);
    },
  };

  return { projects, workspaces, projectRegistry, workspaceRegistry };
}

function createTestLogger() {
  const logger = {
    child: () => logger,
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger as any;
}

function createTempGitRepo(prefix: string): string {
  const raw = mkdtempSync(path.join(tmpdir(), prefix));
  const dir = realpathSync(raw);
  execSync("git init -b main", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });
  execSync("git config commit.gpgsign false", { cwd: dir, stdio: "ignore" });
  writeFileSync(path.join(dir, "README.md"), "# Test\n");
  execSync("git add .", { cwd: dir, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: dir, stdio: "ignore" });
  return dir;
}

const timestamp = "2025-01-01T00:00:00.000Z";

describe("WorkspaceReconciliationService", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("archives workspaces whose directories no longer exist", async () => {
    const { projects, workspaces, projectRegistry, workspaceRegistry } = createTestRegistries();

    projects.set(
      1,
      createPersistedProjectRecord({
        id: 1,
        directory: "/tmp/does-not-exist-reconcile-test",
        kind: "directory",
        displayName: "ghost",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    workspaces.set(
      1,
      createPersistedWorkspaceRecord({
        id: 1,
        projectId: 1,
        directory: "/tmp/does-not-exist-reconcile-test",
        kind: "checkout",
        displayName: "ghost",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

    const service = new WorkspaceReconciliationService({
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
    });

    const result = await service.runOnce();

    expect(result.changesApplied.length).toBeGreaterThanOrEqual(1);
    const wsChange = result.changesApplied.find((c) => c.kind === "workspace_archived");
    expect(wsChange).toBeDefined();
    expect(workspaces.get(1)!.archivedAt).toBeTruthy();
  });

  test("archives orphaned projects after all workspaces are archived", async () => {
    const { projects, workspaces, projectRegistry, workspaceRegistry } = createTestRegistries();

    projects.set(
      1,
      createPersistedProjectRecord({
        id: 1,
        directory: "/tmp/does-not-exist-reconcile-orphan",
        kind: "directory",
        displayName: "orphan",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    workspaces.set(
      1,
      createPersistedWorkspaceRecord({
        id: 1,
        projectId: 1,
        directory: "/tmp/does-not-exist-reconcile-orphan",
        kind: "checkout",
        displayName: "orphan",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

    const service = new WorkspaceReconciliationService({
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
    });

    const result = await service.runOnce();

    const projChange = result.changesApplied.find((c) => c.kind === "project_archived");
    expect(projChange).toBeDefined();
    expect(projects.get(1)!.archivedAt).toBeTruthy();
  });

  test("updates project kind when a directory becomes a git repo", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "reconcile-git-init-"));
    const resolved = realpathSync(dir);
    tempDirs.push(resolved);
    writeFileSync(path.join(resolved, "README.md"), "# Test\n");

    const { projects, workspaces, projectRegistry, workspaceRegistry } = createTestRegistries();

    projects.set(
      1,
      createPersistedProjectRecord({
        id: 1,
        directory: resolved,
        kind: "directory",
        displayName: path.basename(resolved),
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    workspaces.set(
      1,
      createPersistedWorkspaceRecord({
        id: 1,
        projectId: 1,
        directory: resolved,
        kind: "checkout",
        displayName: path.basename(resolved),
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

    // Initialize as git repo
    execSync("git init -b main", { cwd: resolved, stdio: "ignore" });
    execSync('git config user.email "test@test.com"', { cwd: resolved, stdio: "ignore" });
    execSync('git config user.name "Test"', { cwd: resolved, stdio: "ignore" });
    execSync("git config commit.gpgsign false", { cwd: resolved, stdio: "ignore" });
    execSync("git add .", { cwd: resolved, stdio: "ignore" });
    execSync('git commit -m "init"', { cwd: resolved, stdio: "ignore" });

    const service = new WorkspaceReconciliationService({
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
    });

    const result = await service.runOnce();

    const projUpdate = result.changesApplied.find((c) => c.kind === "project_updated");
    expect(projUpdate).toBeDefined();
    expect(projects.get(1)!.kind).toBe("git");
  });

  test("updates project display name when git remote changes", async () => {
    const dir = createTempGitRepo("reconcile-remote-");
    tempDirs.push(dir);

    const { projects, workspaces, projectRegistry, workspaceRegistry } = createTestRegistries();

    projects.set(
      1,
      createPersistedProjectRecord({
        id: 1,
        directory: dir,
        kind: "git",
        displayName: "old-owner/old-repo",
        gitRemote: "git@github.com:old-owner/old-repo.git",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    workspaces.set(
      1,
      createPersistedWorkspaceRecord({
        id: 1,
        projectId: 1,
        directory: dir,
        kind: "checkout",
        displayName: "main",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

    // Change the remote
    execSync("git remote add origin git@github.com:new-owner/new-repo.git", {
      cwd: dir,
      stdio: "ignore",
    });

    const service = new WorkspaceReconciliationService({
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
    });

    const result = await service.runOnce();

    const projUpdate = result.changesApplied.find((c) => c.kind === "project_updated");
    expect(projUpdate).toBeDefined();
    expect(projects.get(1)!.displayName).toBe("new-owner/new-repo");
    expect(projects.get(1)!.gitRemote).toBe("git@github.com:new-owner/new-repo.git");
  });

  test("updates workspace display name when branch changes", async () => {
    const dir = createTempGitRepo("reconcile-branch-");
    tempDirs.push(dir);

    execSync("git checkout -b feature-branch", { cwd: dir, stdio: "ignore" });

    const { projects, workspaces, projectRegistry, workspaceRegistry } = createTestRegistries();

    projects.set(
      1,
      createPersistedProjectRecord({
        id: 1,
        directory: dir,
        kind: "git",
        displayName: path.basename(dir),
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    workspaces.set(
      1,
      createPersistedWorkspaceRecord({
        id: 1,
        projectId: 1,
        directory: dir,
        kind: "checkout",
        displayName: "main",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

    const service = new WorkspaceReconciliationService({
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
    });

    const result = await service.runOnce();

    const wsUpdate = result.changesApplied.find((c) => c.kind === "workspace_updated");
    expect(wsUpdate).toBeDefined();
    expect(workspaces.get(1)!.displayName).toBe("feature-branch");
  });

  test("does not modify already-archived records", async () => {
    const { projects, workspaces, projectRegistry, workspaceRegistry } = createTestRegistries();

    projects.set(
      1,
      createPersistedProjectRecord({
        id: 1,
        directory: "/tmp/does-not-exist-archived",
        kind: "directory",
        displayName: "archived",
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: timestamp,
      }),
    );
    workspaces.set(
      1,
      createPersistedWorkspaceRecord({
        id: 1,
        projectId: 1,
        directory: "/tmp/does-not-exist-archived",
        kind: "checkout",
        displayName: "archived",
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: timestamp,
      }),
    );

    const service = new WorkspaceReconciliationService({
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
    });

    const result = await service.runOnce();

    expect(result.changesApplied).toHaveLength(0);
  });

  test("calls onChanges callback when changes are applied", async () => {
    const { projects, workspaces, projectRegistry, workspaceRegistry } = createTestRegistries();

    projects.set(
      1,
      createPersistedProjectRecord({
        id: 1,
        directory: "/tmp/does-not-exist-callback-test",
        kind: "directory",
        displayName: "ghost",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    workspaces.set(
      1,
      createPersistedWorkspaceRecord({
        id: 1,
        projectId: 1,
        directory: "/tmp/does-not-exist-callback-test",
        kind: "checkout",
        displayName: "ghost",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

    const onChanges = vi.fn();
    const service = new WorkspaceReconciliationService({
      projectRegistry,
      workspaceRegistry,
      logger: createTestLogger(),
      onChanges,
    });

    await service.runOnce();

    expect(onChanges).toHaveBeenCalledTimes(1);
    expect(onChanges.mock.calls[0][0].length).toBeGreaterThan(0);
  });
});
