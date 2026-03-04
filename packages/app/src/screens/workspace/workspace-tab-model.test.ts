import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import { deriveWorkspaceTabModel } from "@/screens/workspace/workspace-tab-model";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";

function makeAgent(input: {
  id: string;
  provider?: Agent["provider"];
  title?: string | null;
  createdAt?: Date;
  lastActivityAt?: Date;
  requiresAttention?: boolean;
  attentionReason?: Agent["attentionReason"];
}): Agent {
  const createdAt = input.createdAt ?? new Date("2026-03-04T00:00:00.000Z");
  const lastActivityAt = input.lastActivityAt ?? createdAt;
  return {
    serverId: "srv",
    id: input.id,
    provider: input.provider ?? "codex",
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
      provider: input.provider ?? "codex",
      sessionId: null,
    },
    title: input.title ?? null,
    cwd: "/repo/worktree",
    model: null,
    thinkingOptionId: null,
    labels: {},
    requiresAttention: input.requiresAttention ?? false,
    attentionReason: input.attentionReason ?? null,
    attentionTimestamp: null,
    archivedAt: null,
  };
}

describe("deriveWorkspaceTabModel", () => {
  it("derives agent and terminal tabs from domain state, not UI membership", () => {
    const model = deriveWorkspaceTabModel({
      workspaceAgents: [
        makeAgent({ id: "agent-a", title: "Build API" }),
        makeAgent({ id: "agent-b", title: "" }),
      ],
      terminals: [{ id: "term-1", name: "shell" }],
      uiTabs: [],
      tabOrder: [],
    });

    expect(model.tabs.map((tab) => tab.descriptor.tabId)).toEqual([
      "agent_agent-a",
      "agent_agent-b",
      "terminal_term-1",
    ]);
    const firstAgent = model.tabs[0]?.descriptor;
    const secondAgent = model.tabs[1]?.descriptor;
    expect(firstAgent?.kind === "agent" ? firstAgent.titleState : null).toBe("ready");
    expect(secondAgent?.kind === "agent" ? secondAgent.titleState : null).toBe("loading");
    expect(secondAgent?.label).toBe("");
  });

  it("keeps draft and file tabs as explicit UI tabs", () => {
    const uiTabs: WorkspaceTab[] = [
      {
        tabId: "draft_123",
        target: { kind: "draft", draftId: "draft_123" },
        createdAt: 1,
      },
      {
        tabId: "file_/repo/worktree/README.md",
        target: { kind: "file", path: "/repo/worktree/README.md" },
        createdAt: 2,
      },
    ];

    const model = deriveWorkspaceTabModel({
      workspaceAgents: [makeAgent({ id: "agent-a", title: "A" })],
      terminals: [],
      uiTabs,
      tabOrder: ["draft_123", "agent_agent-a", "file_/repo/worktree/README.md"],
    });

    expect(model.tabs.map((tab) => tab.descriptor.kind)).toEqual(["draft", "agent", "file"]);
  });

  it("applies stored order and appends newly-derived tabs deterministically", () => {
    const model = deriveWorkspaceTabModel({
      workspaceAgents: [makeAgent({ id: "agent-a" }), makeAgent({ id: "agent-b" })],
      terminals: [{ id: "term-1", name: "zsh" }],
      uiTabs: [],
      tabOrder: ["terminal_term-1", "agent_agent-b"],
    });

    expect(model.tabs.map((tab) => tab.descriptor.tabId)).toEqual([
      "terminal_term-1",
      "agent_agent-b",
      "agent_agent-a",
    ]);
  });

  it("uses focused tab when present, otherwise falls back to first tab", () => {
    const base = {
      workspaceAgents: [makeAgent({ id: "agent-a" }), makeAgent({ id: "agent-b" })],
      terminals: [],
      uiTabs: [],
      tabOrder: ["agent_agent-a", "agent_agent-b"],
    };

    expect(
      deriveWorkspaceTabModel({
        ...base,
        focusedTabId: "agent_agent-b",
      }).activeTabId
    ).toBe("agent_agent-b");

    expect(
      deriveWorkspaceTabModel({
        ...base,
        focusedTabId: "agent_agent-b",
      }).activeTabId
    ).toBe("agent_agent-b");
  });

  it("re-resolves active content for a new workspace when prior focused tab is not available", () => {
    const model = deriveWorkspaceTabModel({
      workspaceAgents: [makeAgent({ id: "workspace-b-agent", title: "B" })],
      terminals: [],
      uiTabs: [],
      tabOrder: ["agent_workspace-b-agent"],
      focusedTabId: "agent_workspace-a-agent",
    });

    expect(model.activeTabId).toBe("agent_workspace-b-agent");
    expect(model.activeTab?.target).toEqual({
      kind: "agent",
      agentId: "workspace-b-agent",
    });
  });

  it("covers regression: non-archived attention agent remains visible even if UI tabs omitted it", () => {
    const offending = makeAgent({
      id: "offender",
      title: "Needs permission",
      requiresAttention: true,
      attentionReason: "permission",
    });

    const model = deriveWorkspaceTabModel({
      workspaceAgents: [offending],
      terminals: [],
      uiTabs: [
        {
          tabId: "draft_123",
          target: { kind: "draft", draftId: "draft_123" },
          createdAt: 1,
        },
      ],
      tabOrder: ["draft_123"],
    });

    expect(model.tabs.some((tab) => tab.descriptor.tabId === "agent_offender")).toBe(true);
  });

  it("includes older attention and failure agents in workspace tabs when session data is complete", () => {
    const olderPermissionAgent = makeAgent({
      id: "agent-permission-old",
      title: "Need permission",
      createdAt: new Date("2026-01-15T00:00:00.000Z"),
      requiresAttention: true,
      attentionReason: "permission",
    });
    const olderFailedAgent = makeAgent({
      id: "agent-failed-old",
      title: "Failed run",
      createdAt: new Date("2026-01-10T00:00:00.000Z"),
      requiresAttention: true,
      attentionReason: "error",
    });
    const newerAgent = makeAgent({
      id: "agent-recent",
      title: "Recent work",
      createdAt: new Date("2026-03-04T00:00:00.000Z"),
    });

    const model = deriveWorkspaceTabModel({
      workspaceAgents: [newerAgent, olderPermissionAgent, olderFailedAgent],
      terminals: [],
      uiTabs: [],
      tabOrder: [],
    });

    expect(model.tabs.some((tab) => tab.descriptor.tabId === "agent_agent-permission-old")).toBe(
      true
    );
    expect(model.tabs.some((tab) => tab.descriptor.tabId === "agent_agent-failed-old")).toBe(
      true
    );
  });
});
