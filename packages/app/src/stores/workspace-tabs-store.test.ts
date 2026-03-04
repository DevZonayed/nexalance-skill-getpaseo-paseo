import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});

import { buildWorkspaceTabPersistenceKey, useWorkspaceTabsStore } from "@/stores/workspace-tabs-store";

const SERVER_ID = "server-1";
const WORKSPACE_ID = "/repo/worktree";

describe("workspace-tabs-store promoteDraftToAgent", () => {
  beforeEach(() => {
    useWorkspaceTabsStore.setState({
      uiTabsByWorkspace: {},
      tabOrderByWorkspace: {},
      focusedTabIdByWorkspace: {},
    });
  });

  it("replaces draft tab id in order with agent tab id, preserves tab count, and removes draft UI tab", () => {
    const draftTabId = "draft_123";
    const agentId = "agent-1";
    const expectedAgentTabId = `agent_${agentId}`;
    const key = buildWorkspaceTabPersistenceKey({ serverId: SERVER_ID, workspaceId: WORKSPACE_ID });
    expect(key).toBeTruthy();
    const workspaceKey = key as string;

    useWorkspaceTabsStore.getState().openDraftTab({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      draftId: draftTabId,
    });

    const beforeOrder = useWorkspaceTabsStore.getState().tabOrderByWorkspace[workspaceKey] ?? [];
    const promoted = useWorkspaceTabsStore.getState().promoteDraftToAgent({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      draftTabId,
      agentId,
    });

    const state = useWorkspaceTabsStore.getState();
    const afterOrder = state.tabOrderByWorkspace[workspaceKey] ?? [];

    expect(promoted).toBe(expectedAgentTabId);
    expect(afterOrder).toEqual([expectedAgentTabId]);
    expect(afterOrder).toHaveLength(beforeOrder.length);
    expect(state.uiTabsByWorkspace[workspaceKey]).toBeUndefined();
    expect(state.focusedTabIdByWorkspace[workspaceKey]).toBe(expectedAgentTabId);
  });

  it("does not create duplicate agent tab ids when agent tab already exists", () => {
    const draftTabId = "draft_456";
    const agentId = "agent-dup";
    const expectedAgentTabId = `agent_${agentId}`;
    const key = buildWorkspaceTabPersistenceKey({ serverId: SERVER_ID, workspaceId: WORKSPACE_ID });
    expect(key).toBeTruthy();
    const workspaceKey = key as string;

    useWorkspaceTabsStore.getState().openDraftTab({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      draftId: draftTabId,
    });
    useWorkspaceTabsStore.getState().openOrFocusTab({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      target: { kind: "agent", agentId },
    });
    useWorkspaceTabsStore.getState().focusTab({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      tabId: draftTabId,
    });

    const beforeOrder = useWorkspaceTabsStore.getState().tabOrderByWorkspace[workspaceKey] ?? [];
    const promoted = useWorkspaceTabsStore.getState().promoteDraftToAgent({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      draftTabId,
      agentId,
    });

    const state = useWorkspaceTabsStore.getState();
    const afterOrder = state.tabOrderByWorkspace[workspaceKey] ?? [];
    const duplicateCount = afterOrder.filter((tabId) => tabId === expectedAgentTabId).length;

    expect(promoted).toBe(expectedAgentTabId);
    expect(duplicateCount).toBe(1);
    expect(afterOrder).toEqual([expectedAgentTabId]);
    expect(afterOrder.length).toBeLessThanOrEqual(beforeOrder.length);
    expect(state.focusedTabIdByWorkspace[workspaceKey]).toBe(expectedAgentTabId);
    expect(state.uiTabsByWorkspace[workspaceKey]).toBeUndefined();
  });
});
