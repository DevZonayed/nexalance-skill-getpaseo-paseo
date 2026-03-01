import { describe, expect, it } from "vitest";
import type { AgentLifecycleStatus } from "@server/shared/agent-lifecycle";
import {
  applySidebarUserOrdering,
  type SidebarAgentListEntry,
} from "./use-sidebar-agents-list";

function toKey(entry: SidebarAgentListEntry): string {
  return `${entry.agent.serverId}:${entry.agent.id}`;
}

function createEntry(input: {
  id: string;
  createdAt: string;
  status?: AgentLifecycleStatus;
  serverId?: string;
}): SidebarAgentListEntry {
  const serverId = input.serverId ?? "server";
  const createdAt = new Date(input.createdAt);
  return {
    agent: {
      id: input.id,
      serverId,
      serverLabel: serverId,
      title: input.id,
      status: input.status ?? "idle",
      createdAt,
      lastActivityAt: createdAt,
      cwd: "/tmp/project",
      provider: "codex",
      pendingPermissionCount: 0,
      requiresAttention: false,
      attentionReason: null,
      attentionTimestamp: null,
      archivedAt: null,
      labels: { ui: "true" },
    },
    project: {
      projectKey: "project",
      projectName: "Project",
      checkout: {
        cwd: "/tmp/project",
        isGit: false,
        currentBranch: null,
        remoteUrl: null,
        isPaseoOwnedWorktree: false,
        mainRepoRoot: null,
      },
    },
  };
}

describe("applySidebarUserOrdering", () => {
  it("keeps unknown entries on the chronological baseline", () => {
    const entries = [
      createEntry({ id: "a", createdAt: "2026-03-01T10:00:00.000Z" }),
      createEntry({ id: "b", createdAt: "2026-02-28T10:00:00.000Z" }),
      createEntry({ id: "x", createdAt: "2026-02-01T10:00:00.000Z" }),
    ];
    const result = applySidebarUserOrdering({
      entries,
      order: ["server:b", "server:a"],
    });

    expect(result.entries.map(toKey)).toEqual(["server:b", "server:a", "server:x"]);
  });

  it("places new entries first while preserving persisted order for known entries", () => {
    const entries = [
      createEntry({ id: "new", createdAt: "2026-03-02T10:00:00.000Z" }),
      createEntry({ id: "a", createdAt: "2026-03-01T10:00:00.000Z" }),
      createEntry({ id: "b", createdAt: "2026-02-28T10:00:00.000Z" }),
    ];
    const result = applySidebarUserOrdering({
      entries,
      order: ["server:b", "server:a"],
    });

    expect(result.entries.map(toKey)).toEqual([
      "server:new",
      "server:b",
      "server:a",
    ]);
  });

  it("keeps persisted placement stable across status changes", () => {
    const baseEntries = [
      createEntry({
        id: "a",
        createdAt: "2026-03-01T10:00:00.000Z",
        status: "running",
      }),
      createEntry({
        id: "b",
        createdAt: "2026-02-28T10:00:00.000Z",
        status: "idle",
      }),
      createEntry({
        id: "c",
        createdAt: "2026-02-27T10:00:00.000Z",
        status: "idle",
      }),
    ];
    const order = ["server:c", "server:a", "server:b"];

    const initial = applySidebarUserOrdering({ entries: baseEntries, order });
    expect(initial.entries.map(toKey)).toEqual(order);

    const afterStatusChange = applySidebarUserOrdering({
      entries: baseEntries.map((entry) =>
        entry.agent.id === "a"
          ? {
              ...entry,
              agent: {
                ...entry.agent,
                status: "idle",
              },
            }
          : entry
      ),
      order,
    });

    expect(afterStatusChange.entries.map(toKey)).toEqual(order);
  });

  it("always includes active entries while capping done entries to 50", () => {
    const doneEntries = Array.from({ length: 55 }, (_, index) =>
      createEntry({
        id: `done-${index + 1}`,
        createdAt: new Date(
          Date.UTC(2026, 2, 1, 12, 0, 0) - index * 60_000
        ).toISOString(),
        status: "idle",
      })
    );
    const activeEntry = createEntry({
      id: "active-oldest",
      createdAt: "2026-01-01T10:00:00.000Z",
      status: "running",
    });

    const result = applySidebarUserOrdering({
      entries: [...doneEntries, activeEntry],
      order: [],
    });

    expect(result.entries).toHaveLength(51);
    expect(result.entries.some((entry) => entry.agent.id === "active-oldest")).toBe(
      true
    );
    expect(result.entries.filter((entry) => entry.agent.status === "idle")).toHaveLength(
      50
    );
    expect(result.hasMore).toBe(true);
  });

  it("prioritizes newest done entries for the 50-item done window", () => {
    const oldDone = Array.from({ length: 55 }, (_, index) =>
      createEntry({
        id: `old-${index + 1}`,
        createdAt: new Date(
          Date.UTC(2026, 1, 1, 12, 0, 0) - index * 60_000
        ).toISOString(),
        status: "idle",
      })
    );
    const recentDone = [
      createEntry({ id: "recent-1", createdAt: "2026-03-01T12:00:00.000Z" }),
      createEntry({ id: "recent-2", createdAt: "2026-03-01T11:59:00.000Z" }),
      createEntry({ id: "recent-3", createdAt: "2026-03-01T11:58:00.000Z" }),
    ];
    const entries = [...oldDone, ...recentDone];
    const pollutedOrder = [...oldDone, ...recentDone].map(toKey);

    const result = applySidebarUserOrdering({
      entries,
      order: pollutedOrder,
    });
    const visibleKeys = result.entries.map(toKey);

    expect(result.entries).toHaveLength(50);
    expect(visibleKeys).toContain("server:recent-1");
    expect(visibleKeys).toContain("server:recent-2");
    expect(visibleKeys).toContain("server:recent-3");
    expect(visibleKeys).not.toContain("server:old-55");
    expect(result.hasMore).toBe(true);
  });
});
