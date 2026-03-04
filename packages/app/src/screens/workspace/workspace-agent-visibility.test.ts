import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import {
  canOpenAgentTabFromRoute,
  deriveWorkspaceAgentVisibility,
} from "@/screens/workspace/workspace-agent-visibility";

function makeAgent(input: {
  id: string;
  cwd: string;
  archivedAt?: Date | null;
  createdAt?: Date;
  lastActivityAt?: Date;
}): Agent {
  const createdAt = input.createdAt ?? new Date("2026-03-04T00:00:00.000Z");
  const lastActivityAt = input.lastActivityAt ?? createdAt;
  return {
    serverId: "srv",
    id: input.id,
    provider: "codex",
    status: "idle",
    createdAt,
    updatedAt: createdAt,
    lastUserMessageAt: null,
    lastActivityAt,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    runtimeInfo: {
      provider: "codex",
      sessionId: null,
    },
    title: null,
    cwd: input.cwd,
    model: null,
    thinkingOptionId: null,
    labels: {},
    requiresAttention: false,
    attentionReason: null,
    attentionTimestamp: null,
    archivedAt: input.archivedAt ?? null,
  };
}

describe("workspace agent visibility", () => {
  it("keeps archived agents hidden from visible list but present in workspace lookup", () => {
    const workspaceId = "/repo/worktree";
    const visible = makeAgent({
      id: "visible-agent",
      cwd: workspaceId,
      createdAt: new Date("2026-03-04T00:00:00.000Z"),
    });
    const archived = makeAgent({
      id: "archived-agent",
      cwd: workspaceId,
      archivedAt: new Date("2026-03-04T00:01:00.000Z"),
      createdAt: new Date("2026-03-04T00:01:00.000Z"),
    });
    const otherWorkspace = makeAgent({
      id: "other-workspace-agent",
      cwd: "/repo/other",
    });

    const sessionAgents = new Map<string, Agent>([
      [visible.id, visible],
      [archived.id, archived],
      [otherWorkspace.id, otherWorkspace],
    ]);

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents,
      workspaceId,
    });

    expect(result.visibleAgents.map((agent) => agent.id)).toEqual(["visible-agent"]);
    expect(result.lookupById.has("visible-agent")).toBe(true);
    expect(result.lookupById.has("archived-agent")).toBe(true);
    expect(result.lookupById.has("other-workspace-agent")).toBe(false);
  });

  it("allows explicit route open for archived agent once agents are hydrated", () => {
    const archivedAgent = makeAgent({
      id: "archived-agent",
      cwd: "/repo/worktree",
      archivedAt: new Date("2026-03-04T00:01:00.000Z"),
    });
    const lookup = new Map<string, Agent>([[archivedAgent.id, archivedAgent]]);

    expect(
      canOpenAgentTabFromRoute({
        agentId: "archived-agent",
        agentsHydrated: true,
        workspaceAgentLookup: lookup,
      })
    ).toBe(true);
  });

  it("sorts same-createdAt agents by lastActivityAt descending", () => {
    const workspaceId = "/repo/worktree";
    const createdAt = new Date("2026-03-04T00:00:00.000Z");
    const newerActivity = makeAgent({
      id: "newer-activity",
      cwd: workspaceId,
      createdAt,
      lastActivityAt: new Date("2026-03-04T00:05:00.000Z"),
    });
    const olderActivity = makeAgent({
      id: "older-activity",
      cwd: workspaceId,
      createdAt,
      lastActivityAt: new Date("2026-03-04T00:01:00.000Z"),
    });
    const sessionAgents = new Map<string, Agent>([
      [olderActivity.id, olderActivity],
      [newerActivity.id, newerActivity],
    ]);

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents,
      workspaceId,
    });

    expect(result.visibleAgents.map((agent) => agent.id)).toEqual([
      "newer-activity",
      "older-activity",
    ]);
  });
});
