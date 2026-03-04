import type { Agent } from "@/stores/session-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

type TerminalLike = {
  id: string;
  name?: string | null;
};

export type WorkspaceDerivedTab = {
  descriptor: WorkspaceTabDescriptor;
  target: WorkspaceTabTarget;
};

export type WorkspaceTabModel = {
  tabs: WorkspaceDerivedTab[];
  activeTabId: string | null;
  activeTab: WorkspaceDerivedTab | null;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatProviderLabel(provider: Agent["provider"]): string {
  if (provider === "claude") {
    return "Claude";
  }
  if (provider === "codex") {
    return "Codex";
  }
  if (!provider) {
    return "Agent";
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function resolveWorkspaceAgentTabLabel(title: string | null | undefined): string | null {
  if (typeof title !== "string") {
    return null;
  }
  const normalized = title.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.toLowerCase() === "new agent") {
    return null;
  }
  return normalized;
}

function normalizeUiTab(tab: WorkspaceTab): WorkspaceTab | null {
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
  workspaceAgents: Agent[];
  terminals: TerminalLike[];
  uiTabs: WorkspaceTab[];
  tabOrder: string[];
  focusedTabId?: string | null;
}): WorkspaceTabModel {
  const tabsById = new Map<string, WorkspaceDerivedTab>();

  for (const agent of input.workspaceAgents) {
    const target: WorkspaceTabTarget = { kind: "agent", agentId: agent.id };
    const tabId = buildWorkspaceTabId(target);
    const label = resolveWorkspaceAgentTabLabel(agent.title);
    tabsById.set(tabId, {
      target,
      descriptor: {
        key: tabId,
        tabId,
        kind: "agent",
        agentId: agent.id,
        provider: agent.provider,
        label: label ?? "",
        subtitle: `${formatProviderLabel(agent.provider)} agent`,
        titleState: label ? "ready" : "loading",
      },
    });
  }

  for (const terminal of input.terminals) {
    const target: WorkspaceTabTarget = { kind: "terminal", terminalId: terminal.id };
    const tabId = buildWorkspaceTabId(target);
    tabsById.set(tabId, {
      target,
      descriptor: {
        key: tabId,
        tabId,
        kind: "terminal",
        terminalId: terminal.id,
        label: trimNonEmpty(terminal.name) ?? "Terminal",
        subtitle: "Terminal",
      },
    });
  }

  const normalizedUiTabs = input.uiTabs
    .map((tab) => normalizeUiTab(tab))
    .filter((tab): tab is WorkspaceTab => tab !== null)
    .sort((left, right) => left.createdAt - right.createdAt);

  for (const tab of normalizedUiTabs) {
    if (tab.target.kind === "draft") {
      tabsById.set(tab.tabId, {
        target: tab.target,
        descriptor: {
          key: tab.tabId,
          tabId: tab.tabId,
          kind: "draft",
          draftId: tab.target.draftId,
          label: "Draft",
          subtitle: "Draft",
        },
      });
      continue;
    }

    if (tab.target.kind === "file") {
      const filePath = tab.target.path;
      const fileName = filePath.split("/").filter(Boolean).pop() ?? filePath;
      tabsById.set(tab.tabId, {
        target: tab.target,
        descriptor: {
          key: tab.tabId,
          tabId: tab.tabId,
          kind: "file",
          filePath,
          label: fileName,
          subtitle: filePath,
        },
      });
    }
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

  const activeTabId =
    focusedTabId && openTabIds.has(focusedTabId)
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
