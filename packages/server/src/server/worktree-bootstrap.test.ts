import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import type { AgentTimelineItem } from "./agent/agent-sdk-types.js";
import {
  createAgentWorktree,
  runAsyncWorktreeBootstrap,
} from "./worktree-bootstrap.js";

describe("runAsyncWorktreeBootstrap", () => {
  let tempDir: string;
  let repoDir: string;
  let paseoHome: string;

  beforeEach(() => {
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), "worktree-bootstrap-test-")));
    repoDir = join(tempDir, "repo");
    paseoHome = join(tempDir, "paseo-home");

    execSync(`mkdir -p ${repoDir}`);
    execSync("git init -b main", { cwd: repoDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: repoDir, stdio: "pipe" });
    execSync("git config user.name 'Test'", { cwd: repoDir, stdio: "pipe" });
    execSync("echo 'hello' > file.txt", { cwd: repoDir, stdio: "pipe" });
    execSync("git add .", { cwd: repoDir, stdio: "pipe" });
    execSync("git -c commit.gpgsign=false commit -m 'initial'", { cwd: repoDir, stdio: "pipe" });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("streams running setup updates live and persists only a final setup timeline row", async () => {
    writeFileSync(
      join(repoDir, "paseo.json"),
      JSON.stringify({
        worktree: {
          setup: ['echo "line-one"; echo "line-two" 1>&2', 'echo "line-three"'],
        },
      })
    );
    execSync("git add paseo.json", { cwd: repoDir, stdio: "pipe" });
    execSync("git -c commit.gpgsign=false commit -m 'add setup'", {
      cwd: repoDir,
      stdio: "pipe",
    });

    const worktree = await createAgentWorktree({
      cwd: repoDir,
      branchName: "feature-streaming-setup",
      baseBranch: "main",
      worktreeSlug: "feature-streaming-setup",
      paseoHome,
    });

    const persisted: AgentTimelineItem[] = [];
    const live: AgentTimelineItem[] = [];

    await runAsyncWorktreeBootstrap({
      agentId: "agent-test",
      worktree,
      terminalManager: null,
      appendTimelineItem: async (item) => {
        persisted.push(item);
        return true;
      },
      emitLiveTimelineItem: async (item: AgentTimelineItem) => {
        live.push(item);
        return true;
      },
    });

    const liveSetupItems = live.filter(
      (item) =>
        item.type === "tool_call" &&
        item.name === "paseo_worktree_setup" &&
        item.status === "running"
    );
    expect(liveSetupItems.length).toBeGreaterThan(0);

    const persistedSetupItems = persisted.filter(
      (item) => item.type === "tool_call" && item.name === "paseo_worktree_setup"
    );
    expect(persistedSetupItems).toHaveLength(1);
    expect(persistedSetupItems[0]?.type).toBe("tool_call");
    if (persistedSetupItems[0]?.type === "tool_call") {
      expect(persistedSetupItems[0].status).toBe("completed");
      expect(persistedSetupItems[0].detail.type).toBe("worktree_setup");

      if (persistedSetupItems[0].detail.type === "worktree_setup") {
        expect(persistedSetupItems[0].detail.log).toContain(
          "==> [1/2] Running: echo \"line-one\"; echo \"line-two\" 1>&2"
        );
        expect(persistedSetupItems[0].detail.log).toContain("line-one");
        expect(persistedSetupItems[0].detail.log).toContain("line-two");
        expect(persistedSetupItems[0].detail.log).toContain(
          "==> [2/2] Running: echo \"line-three\""
        );
        expect(persistedSetupItems[0].detail.log).toContain("line-three");
        expect(persistedSetupItems[0].detail.log).toMatch(/<== \[1\/2\] Exit 0 in \d+\.\d{2}s/);
        expect(persistedSetupItems[0].detail.log).toMatch(/<== \[2\/2\] Exit 0 in \d+\.\d{2}s/);

        expect(persistedSetupItems[0].detail.commands).toHaveLength(2);
        expect(persistedSetupItems[0].detail.commands[0]).toMatchObject({
          index: 1,
          command: 'echo "line-one"; echo "line-two" 1>&2',
          status: "completed",
          exitCode: 0,
        });
        expect(persistedSetupItems[0].detail.commands[1]).toMatchObject({
          index: 2,
          command: 'echo "line-three"',
          status: "completed",
          exitCode: 0,
        });
        expect(
          typeof persistedSetupItems[0].detail.commands[0]?.durationMs === "number"
        ).toBe(true);
        expect(
          typeof persistedSetupItems[0].detail.commands[1]?.durationMs === "number"
        ).toBe(true);
      }
    }

    const liveCallIds = new Set(
      liveSetupItems
        .filter((item): item is Extract<AgentTimelineItem, { type: "tool_call" }> => item.type === "tool_call")
        .map((item) => item.callId)
    );
    expect(liveCallIds.size).toBe(1);
    if (persistedSetupItems[0]?.type === "tool_call") {
      expect(liveCallIds.has(persistedSetupItems[0].callId)).toBe(true);
    }
  });

  it("does not fail setup when live timeline emission throws", async () => {
    writeFileSync(
      join(repoDir, "paseo.json"),
      JSON.stringify({
        worktree: {
          setup: ['echo "ok"'],
        },
      })
    );
    execSync("git add paseo.json", { cwd: repoDir, stdio: "pipe" });
    execSync("git -c commit.gpgsign=false commit -m 'add setup'", {
      cwd: repoDir,
      stdio: "pipe",
    });

    const worktree = await createAgentWorktree({
      cwd: repoDir,
      branchName: "feature-live-failure",
      baseBranch: "main",
      worktreeSlug: "feature-live-failure",
      paseoHome,
    });

    const persisted: AgentTimelineItem[] = [];
    await expect(
      runAsyncWorktreeBootstrap({
        agentId: "agent-live-failure",
        worktree,
        terminalManager: null,
        appendTimelineItem: async (item) => {
          persisted.push(item);
          return true;
        },
        emitLiveTimelineItem: async () => {
          throw new Error("live emit failed");
        },
      })
    ).resolves.toBeUndefined();

    const persistedSetupItems = persisted.filter(
      (item) => item.type === "tool_call" && item.name === "paseo_worktree_setup"
    );
    expect(persistedSetupItems).toHaveLength(1);
    if (persistedSetupItems[0]?.type === "tool_call") {
      expect(persistedSetupItems[0].status).toBe("completed");
    }
  });

  it("truncates each command output to 64kb in the middle", async () => {
    const largeOutputCommand =
      "node -e \"process.stdout.write('prefix-'); process.stdout.write('x'.repeat(70000)); process.stdout.write('-suffix')\"";
    writeFileSync(
      join(repoDir, "paseo.json"),
      JSON.stringify({
        worktree: {
          setup: [largeOutputCommand],
        },
      })
    );
    execSync("git add paseo.json", { cwd: repoDir, stdio: "pipe" });
    execSync("git -c commit.gpgsign=false commit -m 'add large output setup'", {
      cwd: repoDir,
      stdio: "pipe",
    });

    const worktree = await createAgentWorktree({
      cwd: repoDir,
      branchName: "feature-large-output",
      baseBranch: "main",
      worktreeSlug: "feature-large-output",
      paseoHome,
    });

    const persisted: AgentTimelineItem[] = [];
    await runAsyncWorktreeBootstrap({
      agentId: "agent-large-output",
      worktree,
      terminalManager: null,
      appendTimelineItem: async (item) => {
        persisted.push(item);
        return true;
      },
      emitLiveTimelineItem: async () => true,
    });

    const persistedSetupItem = persisted.find(
      (item): item is Extract<AgentTimelineItem, { type: "tool_call" }> =>
        item.type === "tool_call" && item.name === "paseo_worktree_setup"
    );
    expect(persistedSetupItem).toBeDefined();
    expect(persistedSetupItem?.detail.type).toBe("worktree_setup");
    if (!persistedSetupItem || persistedSetupItem.detail.type !== "worktree_setup") {
      throw new Error("Expected worktree_setup tool detail");
    }

    expect(persistedSetupItem.detail.truncated).toBe(true);
    expect(persistedSetupItem.detail.log).toContain("prefix-");
    expect(persistedSetupItem.detail.log).toContain("-suffix");
    expect(persistedSetupItem.detail.log).toContain("...<output truncated in the middle>...");
  });
});
