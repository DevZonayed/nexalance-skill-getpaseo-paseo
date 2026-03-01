import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useDaemonRegistry } from "@/contexts/daemon-registry-context";
import { useSessionStore, type Agent } from "@/stores/session-store";
import {
  getHostRuntimeStore,
} from "@/runtime/host-runtime";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import {
  isSidebarActiveAgent,
} from "@/utils/sidebar-agent-state";
import type { ProjectPlacementPayload } from "@server/shared/messages";
import { resolveProjectPlacement } from "@/utils/project-placement";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";

const SIDEBAR_DONE_FILL_TARGET = 50;
const EMPTY_ORDER: string[] = [];

export interface SidebarProjectFilterOption {
  projectKey: string;
  projectName: string;
  activeCount: number;
  totalCount: number;
  serverId: string;
  workingDir: string;
}

export interface SidebarAgentListEntry {
  agent: AggregatedAgent & { createdAt: Date };
  project: ProjectPlacementPayload;
}

export interface SidebarAgentsListResult {
  entries: SidebarAgentListEntry[];
  projectFilterOptions: SidebarProjectFilterOption[];
  hasMoreEntries: boolean;
  isLoading: boolean;
  isInitialLoad: boolean;
  isRevalidating: boolean;
  refreshAll: () => void;
}

function compareByCreatedAtDesc(
  left: SidebarAgentListEntry,
  right: SidebarAgentListEntry
): number {
  const createdDelta = right.agent.createdAt.getTime() - left.agent.createdAt.getTime();
  if (createdDelta !== 0) {
    return createdDelta;
  }

  const leftTitle = (left.agent.title?.trim() || "New agent").toLocaleLowerCase();
  const rightTitle = (right.agent.title?.trim() || "New agent").toLocaleLowerCase();
  const titleDelta = leftTitle.localeCompare(rightTitle, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (titleDelta !== 0) {
    return titleDelta;
  }

  return left.agent.id.localeCompare(right.agent.id, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function toSidebarAgentKey(entry: SidebarAgentListEntry): string {
  return `${entry.agent.serverId}:${entry.agent.id}`;
}

export function applySidebarUserOrdering(input: {
  entries: SidebarAgentListEntry[];
  order: string[];
}): { entries: SidebarAgentListEntry[]; hasMore: boolean } {
  const sortedByCreatedAt = [...input.entries].sort(compareByCreatedAtDesc);
  const entryByKey = new Map<string, SidebarAgentListEntry>();
  for (const entry of sortedByCreatedAt) {
    entryByKey.set(toSidebarAgentKey(entry), entry);
  }

  const prunedOrder: string[] = [];
  const seenOrderKeys = new Set<string>();
  for (const key of input.order) {
    if (!entryByKey.has(key) || seenOrderKeys.has(key)) {
      continue;
    }
    seenOrderKeys.add(key);
    prunedOrder.push(key);
  }

  const sorted: SidebarAgentListEntry[] = [];
  if (prunedOrder.length === 0) {
    sorted.push(...sortedByCreatedAt);
  } else {
    const knownOrderSet = new Set(prunedOrder);
    let knownOrderIndex = 0;
    for (const entry of sortedByCreatedAt) {
      const key = toSidebarAgentKey(entry);
      if (!knownOrderSet.has(key)) {
        sorted.push(entry);
        continue;
      }
      const orderedKey = prunedOrder[knownOrderIndex] ?? key;
      knownOrderIndex += 1;
      sorted.push(entryByKey.get(orderedKey) ?? entry);
    }
  }

  const doneEntries = sorted.filter(
    (entry) =>
      !isSidebarActiveAgent({
        status: entry.agent.status,
        pendingPermissionCount: entry.agent.pendingPermissionCount,
        requiresAttention: entry.agent.requiresAttention,
        attentionReason: entry.agent.attentionReason,
      })
  );
  const visibleDoneKeys = new Set(
    [...doneEntries]
      .sort(compareByCreatedAtDesc)
      .slice(0, SIDEBAR_DONE_FILL_TARGET)
      .map((entry) => toSidebarAgentKey(entry))
  );

  const visible: SidebarAgentListEntry[] = [];
  let hiddenDoneCount = 0;
  for (const entry of sorted) {
    const key = toSidebarAgentKey(entry);
    if (
      isSidebarActiveAgent({
        status: entry.agent.status,
        pendingPermissionCount: entry.agent.pendingPermissionCount,
        requiresAttention: entry.agent.requiresAttention,
        attentionReason: entry.agent.attentionReason,
      })
    ) {
      visible.push(entry);
      continue;
    }
    if (visibleDoneKeys.has(key)) {
      visible.push(entry);
      continue;
    }
    hiddenDoneCount += 1;
  }

  return {
    entries: visible,
    hasMore: hiddenDoneCount > 0,
  };
}

function toAggregatedAgent(params: {
  source: Agent;
  serverId: string;
  serverLabel: string;
  lastActivityAt: Date;
}): AggregatedAgent & { createdAt: Date } {
  const source = params.source;
  return {
    id: source.id,
    serverId: params.serverId,
    serverLabel: params.serverLabel,
    title: source.title ?? null,
    status: source.status,
    createdAt: source.createdAt,
    lastActivityAt: params.lastActivityAt,
    cwd: source.cwd,
    provider: source.provider,
    pendingPermissionCount: source.pendingPermissions.length,
    requiresAttention: source.requiresAttention,
    attentionReason: source.attentionReason,
    attentionTimestamp: source.attentionTimestamp ?? null,
    archivedAt: source.archivedAt ?? null,
    labels: source.labels,
  };
}

export function useSidebarAgentsList(options?: {
  serverId?: string | null;
  selectedProjectFilterKey?: string | null;
}): SidebarAgentsListResult {
  const { daemons } = useDaemonRegistry();
  const runtime = getHostRuntimeStore();
  const daemonLabelSignature = useMemo(
    () =>
      daemons
        .map((daemon) => `${daemon.serverId}:${daemon.label ?? ""}`)
        .join("|"),
    [daemons]
  );
  const serverId = useMemo(() => {
    const value = options?.serverId;
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }, [options?.serverId]);
  const serverLabel = useMemo(() => {
    if (!serverId) {
      return "";
    }
    return daemons.find((daemon) => daemon.serverId === serverId)?.label ?? serverId;
  }, [daemonLabelSignature, serverId]);

  const selectedProjectFilterKey = useMemo(() => {
    const value = options?.selectedProjectFilterKey;
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [options?.selectedProjectFilterKey]);
  const persistedOrder = useSidebarOrderStore((state) =>
    serverId ? state.orderByServerId[serverId] ?? EMPTY_ORDER : EMPTY_ORDER
  );

  const isActive = Boolean(serverId);
  const liveAgents = useSessionStore((state) =>
    isActive && serverId ? state.sessions[serverId]?.agents ?? null : null
  );
  const agentLastActivity = useSessionStore((state) =>
    isActive ? state.agentLastActivity : null
  );
  const runtimeStatusSignature = useSyncExternalStore(
    (onStoreChange) =>
      isActive && serverId ? runtime.subscribe(serverId, onStoreChange) : () => {},
    () => {
      if (!isActive || !serverId) {
        return "idle:idle";
      }
      const snapshot = runtime.getSnapshot(serverId);
      const connectionStatus = snapshot?.connectionStatus ?? "idle";
      const directoryStatus = snapshot?.agentDirectoryStatus ?? "idle";
      return `${connectionStatus}:${directoryStatus}`;
    },
    () => {
      if (!isActive || !serverId) {
        return "idle:idle";
      }
      const snapshot = runtime.getSnapshot(serverId);
      const connectionStatus = snapshot?.connectionStatus ?? "idle";
      const directoryStatus = snapshot?.agentDirectoryStatus ?? "idle";
      return `${connectionStatus}:${directoryStatus}`;
    }
  );
  const [connectionStatus = "idle", directoryStatus = "idle"] =
    runtimeStatusSignature.split(":", 2);

  const {
    entries,
    projectFilterOptions,
    hasAnyData,
    hasMoreEntries,
  } = useMemo(() => {
    if (!isActive || !serverId || !liveAgents) {
      return {
        entries: [] as SidebarAgentListEntry[],
        projectFilterOptions: [] as SidebarProjectFilterOption[],
        hasAnyData: false,
        hasMoreEntries: false,
      };
    }

    const seenAgentIds = new Set<string>();
    const byProject = new Map<string, SidebarProjectFilterOption>();
    const mergedEntries: SidebarAgentListEntry[] = [];

    const pushEntry = (entry: SidebarAgentListEntry): void => {
      if (entry.agent.archivedAt) {
        return;
      }
      const dedupeKey = `${entry.agent.serverId}:${entry.agent.id}`;
      if (seenAgentIds.has(dedupeKey)) {
        return;
      }
      seenAgentIds.add(dedupeKey);
      mergedEntries.push(entry);

      const existing = byProject.get(entry.project.projectKey);
      const isActive = isSidebarActiveAgent({
        status: entry.agent.status,
        pendingPermissionCount: entry.agent.pendingPermissionCount,
        requiresAttention: entry.agent.requiresAttention,
        attentionReason: entry.agent.attentionReason,
      });
      if (existing) {
        existing.totalCount += 1;
        if (isActive) {
          existing.activeCount += 1;
        }
        return;
      }

      byProject.set(entry.project.projectKey, {
        projectKey: entry.project.projectKey,
        projectName: entry.project.projectName,
        activeCount: isActive ? 1 : 0,
        totalCount: 1,
        serverId,
        workingDir: entry.project.checkout.cwd,
      });
    };

    for (const live of liveAgents.values()) {
      if (live.archivedAt || live.labels.ui !== "true") {
        continue;
      }
      const project = resolveProjectPlacement({
        projectPlacement: live.projectPlacement ?? null,
        cwd: live.cwd,
      });
      const effectiveLastActivity =
        agentLastActivity?.get(live.id) ?? live.lastActivityAt;
      const agent = toAggregatedAgent({
        source: live,
        serverId,
        serverLabel,
        lastActivityAt: effectiveLastActivity,
      });
      pushEntry({ agent, project });
    }

    const filteredEntries = selectedProjectFilterKey
      ? mergedEntries.filter(
          (entry) => entry.project.projectKey === selectedProjectFilterKey
        )
      : mergedEntries;
    const ordered = applySidebarUserOrdering({
      entries: filteredEntries,
      order: persistedOrder,
    });
    const options = Array.from(byProject.values()).sort((left, right) => {
      if (left.activeCount !== right.activeCount) {
        return right.activeCount - left.activeCount;
      }
      return left.projectName.localeCompare(right.projectName);
    });

    return {
      entries: ordered.entries,
      projectFilterOptions: options,
      hasAnyData: mergedEntries.length > 0,
      hasMoreEntries: ordered.hasMore,
    };
  }, [
    agentLastActivity,
    isActive,
    liveAgents,
    persistedOrder,
    selectedProjectFilterKey,
    serverId,
    serverLabel,
  ]);

  const refreshAll = useCallback(() => {
    if (!isActive || !serverId || connectionStatus !== "online") {
      return;
    }
    void runtime.refreshAgentDirectory({ serverId, page: { limit: 50 } }).catch(() => undefined);
  }, [connectionStatus, isActive, runtime, serverId]);

  const isDirectoryLoading =
    isActive &&
    Boolean(serverId) &&
    (directoryStatus === "initial_loading" || directoryStatus === "revalidating");
  const isInitialLoad = isDirectoryLoading && !hasAnyData;
  const isRevalidating = isDirectoryLoading && hasAnyData;

  return {
    entries,
    projectFilterOptions,
    hasMoreEntries,
    isLoading: isDirectoryLoading,
    isInitialLoad,
    isRevalidating,
    refreshAll,
  };
}
