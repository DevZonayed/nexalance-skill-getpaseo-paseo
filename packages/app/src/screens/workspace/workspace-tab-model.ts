import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

export interface WorkspaceDerivedTab {
  descriptor: WorkspaceTabDescriptor;
}

export interface WorkspaceTabModel {
  tabs: WorkspaceDerivedTab[];
  activeTabId: string | null;
  activeTab: WorkspaceDerivedTab | null;
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function tabTargetsEqual(left: WorkspaceTabTarget, right: WorkspaceTabTarget): boolean {
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

function normalizeWorkspaceTab(tab: WorkspaceTab): WorkspaceTab | null {
  if (!tab || typeof tab !== "object") {
    return null;
  }
  const tabId = trimNonEmpty(tab.tabId);
  if (!tabId) {
    return null;
  }
  if (!tab.target || typeof tab.target !== "object") {
    return null;
  }
  if (tab.target.kind === "draft") {
    const draftId = trimNonEmpty(tab.target.draftId);
    if (!draftId) {
      return null;
    }
    return {
      tabId,
      target: { kind: "draft", draftId },
      createdAt: tab.createdAt,
    };
  }
  if (tab.target.kind === "agent") {
    const agentId = trimNonEmpty(tab.target.agentId);
    if (!agentId) {
      return null;
    }
    return {
      tabId,
      target: { kind: "agent", agentId },
      createdAt: tab.createdAt,
    };
  }
  if (tab.target.kind === "terminal") {
    const terminalId = trimNonEmpty(tab.target.terminalId);
    if (!terminalId) {
      return null;
    }
    return {
      tabId,
      target: { kind: "terminal", terminalId },
      createdAt: tab.createdAt,
    };
  }
  if (tab.target.kind === "file") {
    const path = trimNonEmpty(tab.target.path);
    if (!path) {
      return null;
    }
    return {
      tabId,
      target: { kind: "file", path: path.replace(/\\/g, "/") },
      createdAt: tab.createdAt,
    };
  }
  return null;
}

export function buildWorkspaceTabId(target: WorkspaceTabTarget): string {
  if (target.kind === "draft") {
    return target.draftId;
  }
  if (target.kind === "agent") {
    return `agent_${target.agentId}`;
  }
  if (target.kind === "terminal") {
    return `terminal_${target.terminalId}`;
  }
  return `file_${target.path}`;
}

export function deriveWorkspaceTabModel(input: {
  tabs: WorkspaceTab[];
  tabOrder: string[];
  focusedTabId?: string | null;
  preferredTarget?: WorkspaceTabTarget | null;
}): WorkspaceTabModel {
  const tabsById = new Map<string, WorkspaceDerivedTab>();

  const normalizedTabs = input.tabs
    .map((tab) => normalizeWorkspaceTab(tab))
    .filter((tab): tab is WorkspaceTab => tab !== null)
    .sort((left, right) => left.createdAt - right.createdAt);

  for (const tab of normalizedTabs) {
    tabsById.set(tab.tabId, {
      descriptor: {
        key: tab.tabId,
        tabId: tab.tabId,
        kind: tab.target.kind,
        target: tab.target,
      },
    });
  }

  const orderedTabIds: string[] = [];
  const used = new Set<string>();
  for (const tabId of input.tabOrder) {
    const normalizedTabId = trimNonEmpty(tabId);
    if (!normalizedTabId || used.has(normalizedTabId) || !tabsById.has(normalizedTabId)) {
      continue;
    }
    used.add(normalizedTabId);
    orderedTabIds.push(normalizedTabId);
  }

  for (const tabId of tabsById.keys()) {
    if (used.has(tabId)) {
      continue;
    }
    used.add(tabId);
    orderedTabIds.push(tabId);
  }

  const tabs = orderedTabIds
    .map((tabId) => tabsById.get(tabId) ?? null)
    .filter((tab): tab is WorkspaceDerivedTab => tab !== null);

  const openTabIds = new Set(tabs.map((tab) => tab.descriptor.tabId));
  const focusedTabId = trimNonEmpty(input.focusedTabId);
  const preferredTarget = input.preferredTarget ?? null;
  const preferredTabId = (() => {
    if (!preferredTarget) {
      return null;
    }
    const matchingTab =
      tabs.find((tab) => tabTargetsEqual(tab.descriptor.target, preferredTarget)) ?? null;
    return matchingTab?.descriptor.tabId ?? buildWorkspaceTabId(preferredTarget);
  })();

  const activeTabId =
    preferredTabId && openTabIds.has(preferredTabId)
      ? preferredTabId
      : focusedTabId && openTabIds.has(focusedTabId)
        ? focusedTabId
        : tabs[0]?.descriptor.tabId ?? null;

  const activeTab = activeTabId
    ? tabs.find((tab) => tab.descriptor.tabId === activeTabId) ?? null
    : null;

  return {
    tabs,
    activeTabId,
    activeTab,
  };
}
