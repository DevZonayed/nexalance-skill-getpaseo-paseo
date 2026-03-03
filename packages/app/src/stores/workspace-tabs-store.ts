import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type WorkspaceTabTarget =
  | { kind: "draft"; draftId: string }
  | { kind: "agent"; agentId: string }
  | { kind: "terminal"; terminalId: string }
  | { kind: "file"; path: string };

export type WorkspaceTab = {
  tabId: string;
  target: WorkspaceTabTarget;
  createdAt: number;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWorkspaceId(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

export function buildWorkspaceTabPersistenceKey(input: {
  serverId: string;
  workspaceId: string;
}): string | null {
  const serverId = trimNonEmpty(input.serverId);
  const workspaceId = trimNonEmpty(input.workspaceId);
  if (!serverId || !workspaceId) {
    return null;
  }
  return `${serverId}:${normalizeWorkspaceId(workspaceId)}`;
}

function normalizeTabTarget(value: WorkspaceTabTarget | null | undefined): WorkspaceTabTarget | null {
  if (!value || typeof value !== "object" || typeof value.kind !== "string") {
    return null;
  }
  if (value.kind === "draft") {
    const draftId = trimNonEmpty(value.draftId);
    return draftId ? { kind: "draft", draftId } : null;
  }
  if (value.kind === "agent") {
    const agentId = trimNonEmpty(value.agentId);
    return agentId ? { kind: "agent", agentId } : null;
  }
  if (value.kind === "terminal") {
    const terminalId = trimNonEmpty(value.terminalId);
    return terminalId ? { kind: "terminal", terminalId } : null;
  }
  if (value.kind === "file") {
    const path = trimNonEmpty(value.path);
    return path ? { kind: "file", path: path.replace(/\\/g, "/") } : null;
  }
  return null;
}

function buildDeterministicTabId(target: WorkspaceTabTarget): string {
  if (target.kind === "draft") {
    return target.draftId;
  }
  if (target.kind === "agent") {
    return `agent_${target.agentId}`;
  }
  if (target.kind === "terminal") {
    return `terminal_${target.terminalId}`;
  }
  // File tabs are session-only, so stable IDs are still useful for in-session routing.
  return `file_${target.path}`;
}

function targetsEqual(left: WorkspaceTabTarget, right: WorkspaceTabTarget): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "draft" && right.kind === "draft") {
    return left.draftId === right.draftId;
  }
  if (left.kind === "agent" && right.kind === "agent") {
    return left.agentId === right.agentId;
  }
  if (left.kind === "terminal" && right.kind === "terminal") {
    return left.terminalId === right.terminalId;
  }
  if (left.kind === "file" && right.kind === "file") {
    return left.path === right.path;
  }
  return false;
}

type WorkspaceTabsState = {
  openTabsByWorkspace: Record<string, WorkspaceTab[]>;
  focusedTabIdByWorkspace: Record<string, string>;
  openDraftTab: (input: { serverId: string; workspaceId: string; draftId: string }) => string | null;
  seedWorkspaceTabs: (input: {
    serverId: string;
    workspaceId: string;
    targets: WorkspaceTabTarget[];
    focusedTabId?: string | null;
  }) => void;
  openOrFocusTab: (input: {
    serverId: string;
    workspaceId: string;
    target: WorkspaceTabTarget;
  }) => string | null;
  focusTab: (input: { serverId: string; workspaceId: string; tabId: string }) => void;
  closeTab: (input: { serverId: string; workspaceId: string; tabId: string }) => void;
  reorderTabs: (input: { serverId: string; workspaceId: string; tabIds: string[] }) => void;
  replaceTabTarget: (input: {
    serverId: string;
    workspaceId: string;
    tabId: string;
    target: WorkspaceTabTarget;
  }) => void;
  getWorkspaceTabs: (input: { serverId: string; workspaceId: string }) => WorkspaceTab[];
};

export const useWorkspaceTabsStore = create<WorkspaceTabsState>()(
  persist(
    (set, get) => ({
      openTabsByWorkspace: {},
      focusedTabIdByWorkspace: {},
      openDraftTab: ({ serverId, workspaceId, draftId }) => {
        const key = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
        const normalizedDraftId = trimNonEmpty(draftId);
        if (!key || !normalizedDraftId) {
          return null;
        }

        const target: WorkspaceTabTarget = { kind: "draft", draftId: normalizedDraftId };
        const tabId = buildDeterministicTabId(target);
        const now = Date.now();
        set((state) => {
          const current = state.openTabsByWorkspace[key] ?? [];
          if (current.some((tab) => tab.tabId === tabId)) {
            return {
              ...state,
              focusedTabIdByWorkspace: {
                ...state.focusedTabIdByWorkspace,
                [key]: tabId,
              },
            };
          }
          const nextTabs: WorkspaceTab[] = [...current, { tabId, target, createdAt: now }];
          return {
            openTabsByWorkspace: { ...state.openTabsByWorkspace, [key]: nextTabs },
            focusedTabIdByWorkspace: { ...state.focusedTabIdByWorkspace, [key]: tabId },
          };
        });
        return tabId;
      },
      seedWorkspaceTabs: ({ serverId, workspaceId, targets, focusedTabId }) => {
        const key = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
        if (!key) {
          return;
        }
        const now = Date.now();
        const nextTabs: WorkspaceTab[] = [];
        const used = new Set<string>();
        for (const raw of targets) {
          const normalized = normalizeTabTarget(raw);
          if (!normalized) {
            continue;
          }
          const tabId = buildDeterministicTabId(normalized);
          if (used.has(tabId)) {
            continue;
          }
          used.add(tabId);
          nextTabs.push({ tabId, target: normalized, createdAt: now });
        }
        if (nextTabs.length === 0) {
          return;
        }
        set((state) => {
          const current = state.openTabsByWorkspace[key] ?? [];
          if (current.length > 0) {
            return state;
          }
          const resolvedFocus = trimNonEmpty(focusedTabId) ?? nextTabs[0]?.tabId ?? null;
          return {
            openTabsByWorkspace: { ...state.openTabsByWorkspace, [key]: nextTabs },
            ...(resolvedFocus
              ? {
                  focusedTabIdByWorkspace: {
                    ...state.focusedTabIdByWorkspace,
                    [key]: resolvedFocus,
                  },
                }
              : {}),
          };
        });
      },
      openOrFocusTab: ({ serverId, workspaceId, target }) => {
        const key = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
        const normalizedTarget = normalizeTabTarget(target);
        if (!key || !normalizedTarget) {
          return null;
        }
        const tabId = buildDeterministicTabId(normalizedTarget);
        const now = Date.now();
        set((state) => {
          const current = state.openTabsByWorkspace[key] ?? [];
          const existing = current.find((tab) => tab.tabId === tabId);
          if (existing) {
            if (state.focusedTabIdByWorkspace[key] === tabId) {
              return state;
            }
            return {
              ...state,
              focusedTabIdByWorkspace: {
                ...state.focusedTabIdByWorkspace,
                [key]: tabId,
              },
            };
          }
          const nextTabs: WorkspaceTab[] = [...current, { tabId, target: normalizedTarget, createdAt: now }];
          return {
            openTabsByWorkspace: { ...state.openTabsByWorkspace, [key]: nextTabs },
            focusedTabIdByWorkspace: { ...state.focusedTabIdByWorkspace, [key]: tabId },
          };
        });
        return tabId;
      },
      focusTab: ({ serverId, workspaceId, tabId }) => {
        const key = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
        const normalizedTabId = trimNonEmpty(tabId);
        if (!key || !normalizedTabId) {
          return;
        }
        set((state) => {
          if (state.focusedTabIdByWorkspace[key] === normalizedTabId) {
            return state;
          }
          return {
            ...state,
            focusedTabIdByWorkspace: {
              ...state.focusedTabIdByWorkspace,
              [key]: normalizedTabId,
            },
          };
        });
      },
      closeTab: ({ serverId, workspaceId, tabId }) => {
        const key = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
        const normalizedTabId = trimNonEmpty(tabId);
        if (!key || !normalizedTabId) {
          return;
        }
        set((state) => {
          const currentTabs = state.openTabsByWorkspace[key] ?? [];
          if (currentTabs.length === 0 || !currentTabs.some((tab) => tab.tabId === normalizedTabId)) {
            return state;
          }
          const nextTabs = currentTabs.filter((tab) => tab.tabId !== normalizedTabId);
          const nextOpenTabsByWorkspace =
            nextTabs.length === 0
              ? (() => {
                  const { [key]: _removed, ...rest } = state.openTabsByWorkspace;
                  return rest;
                })()
              : { ...state.openTabsByWorkspace, [key]: nextTabs };

          const currentFocused = state.focusedTabIdByWorkspace[key] ?? null;
          const nextFocused =
            currentFocused !== normalizedTabId
              ? currentFocused
              : nextTabs[nextTabs.length - 1]?.tabId ?? null;
          const nextFocusedByWorkspace = (() => {
            if (!nextFocused) {
              const { [key]: _removed, ...rest } = state.focusedTabIdByWorkspace;
              return rest;
            }
            return { ...state.focusedTabIdByWorkspace, [key]: nextFocused };
          })();

          return {
            openTabsByWorkspace: nextOpenTabsByWorkspace,
            focusedTabIdByWorkspace: nextFocusedByWorkspace,
          };
        });
      },
      reorderTabs: ({ serverId, workspaceId, tabIds }) => {
        const key = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
        if (!key) {
          return;
        }
        const normalized = tabIds.map((id) => id.trim()).filter(Boolean);
        set((state) => {
          const current = state.openTabsByWorkspace[key] ?? [];
          if (current.length <= 1) {
            return state;
          }
          const byId = new Map(current.map((tab) => [tab.tabId, tab]));
          const used = new Set<string>();
          const next: WorkspaceTab[] = [];
          for (const id of normalized) {
            const tab = byId.get(id);
            if (!tab || used.has(id)) {
              continue;
            }
            used.add(id);
            next.push(tab);
          }
          for (const tab of current) {
            if (used.has(tab.tabId)) {
              continue;
            }
            next.push(tab);
          }
          if (next.length !== current.length) {
            return state;
          }
          let same = true;
          for (let i = 0; i < next.length; i += 1) {
            if (next[i]?.tabId !== current[i]?.tabId) {
              same = false;
              break;
            }
          }
          if (same) {
            return state;
          }
          return {
            ...state,
            openTabsByWorkspace: { ...state.openTabsByWorkspace, [key]: next },
          };
        });
      },
      replaceTabTarget: ({ serverId, workspaceId, tabId, target }) => {
        const key = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
        const normalizedTabId = trimNonEmpty(tabId);
        const normalizedTarget = normalizeTabTarget(target);
        if (!key || !normalizedTabId || !normalizedTarget) {
          return;
        }

        set((state) => {
          const current = state.openTabsByWorkspace[key] ?? [];
          const idx = current.findIndex((tab) => tab.tabId === normalizedTabId);
          if (idx < 0) {
            return state;
          }
          const existing = current[idx];
          if (existing && targetsEqual(existing.target, normalizedTarget)) {
            return state;
          }
          const nextTabs = [...current];
          nextTabs[idx] = {
            tabId: normalizedTabId,
            target: normalizedTarget,
            createdAt: existing?.createdAt ?? Date.now(),
          };
          return {
            ...state,
            openTabsByWorkspace: { ...state.openTabsByWorkspace, [key]: nextTabs },
          };
        });
      },
      getWorkspaceTabs: ({ serverId, workspaceId }) => {
        const key = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
        if (!key) {
          return [];
        }
        return get().openTabsByWorkspace[key] ?? [];
      },
    }),
    {
      name: "workspace-tabs-state",
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        const nextOpenTabsByWorkspace: Record<string, WorkspaceTab[]> = {};
        for (const key in state.openTabsByWorkspace) {
          const tabs = state.openTabsByWorkspace[key] ?? [];
          const persistedTabs = tabs.filter((tab) => tab.target.kind !== "file");
          if (persistedTabs.length > 0) {
            nextOpenTabsByWorkspace[key] = persistedTabs;
          }
        }
        return {
          openTabsByWorkspace: nextOpenTabsByWorkspace,
          focusedTabIdByWorkspace: state.focusedTabIdByWorkspace,
        } as WorkspaceTabsState;
      },
      migrate: (persistedState) => {
        // Previous versions stored tab order + last focused tab by workspace using agent/terminal targets.
        const legacy = persistedState as
          | {
              version?: number;
              state?: any;
              lastFocusedTabByWorkspace?: Record<string, any>;
              tabOrderByWorkspace?: Record<string, string[]>;
            }
          | undefined;

        const rawState = (legacy as any)?.state ?? legacy ?? {};
        const legacyFocused = rawState.lastFocusedTabByWorkspace ?? {};
        const legacyOrder = rawState.tabOrderByWorkspace ?? {};

        const openTabsByWorkspace: Record<string, WorkspaceTab[]> = {};
        const focusedTabIdByWorkspace: Record<string, string> = {};

        for (const key in legacyOrder) {
          const list = legacyOrder[key];
          if (!Array.isArray(list) || list.length === 0) {
            continue;
          }
          const now = Date.now();
          const tabs: WorkspaceTab[] = [];
          for (const entry of list) {
            const raw = typeof entry === "string" ? entry.trim() : "";
            if (!raw) continue;
            if (raw.startsWith("agent:")) {
              const agentId = raw.slice("agent:".length).trim();
              if (!agentId) continue;
              tabs.push({
                tabId: `agent_${agentId}`,
                target: { kind: "agent", agentId },
                createdAt: now,
              });
              continue;
            }
            if (raw.startsWith("terminal:")) {
              const terminalId = raw.slice("terminal:".length).trim();
              if (!terminalId) continue;
              tabs.push({
                tabId: `terminal_${terminalId}`,
                target: { kind: "terminal", terminalId },
                createdAt: now,
              });
            }
          }
          if (tabs.length > 0) {
            openTabsByWorkspace[key] = tabs;
          }
        }

        for (const key in legacyFocused) {
          const value = legacyFocused[key];
          if (!value || typeof value !== "object" || typeof value.kind !== "string") {
            continue;
          }
          if (value.kind === "agent" && typeof value.agentId === "string" && value.agentId.trim()) {
            focusedTabIdByWorkspace[key] = `agent_${value.agentId.trim()}`;
          }
          if (
            value.kind === "terminal" &&
            typeof value.terminalId === "string" &&
            value.terminalId.trim()
          ) {
            focusedTabIdByWorkspace[key] = `terminal_${value.terminalId.trim()}`;
          }
        }

        return {
          openTabsByWorkspace,
          focusedTabIdByWorkspace,
        };
      },
    }
  )
);
