import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDaemonConnections } from "@/contexts/daemon-connections-context";
import { useSessionStore, type Agent } from "@/stores/session-store";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { normalizeAgentSnapshot } from "@/utils/agent-snapshots";
import {
  deriveSidebarStateBucket,
  isSidebarActiveAgent,
} from "@/utils/sidebar-agent-state";
import type { ProjectPlacementPayload } from "@server/shared/messages";

const SIDEBAR_AGENTS_STALE_TIME = 15_000;
const SIDEBAR_AGENTS_REFETCH_INTERVAL = 10_000;
const SIDEBAR_DONE_FILL_TARGET = 50;

export interface SidebarProjectOption {
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

export interface SidebarAgentsGroupedResult {
  entries: SidebarAgentListEntry[];
  projectOptions: SidebarProjectOption[];
  hasMoreEntries: boolean;
  isLoading: boolean;
  isInitialLoad: boolean;
  isRevalidating: boolean;
  refreshAll: () => void;
}

function compareByLastActivityDesc(
  left: SidebarAgentListEntry,
  right: SidebarAgentListEntry
): number {
  return right.agent.lastActivityAt.getTime() - left.agent.lastActivityAt.getTime();
}

function compareByTitleAsc(
  left: SidebarAgentListEntry,
  right: SidebarAgentListEntry
): number {
  const leftTitle = (left.agent.title?.trim() || "New agent").toLocaleLowerCase();
  const rightTitle = (right.agent.title?.trim() || "New agent").toLocaleLowerCase();
  const titleCmp = leftTitle.localeCompare(rightTitle, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (titleCmp !== 0) {
    return titleCmp;
  }

  // Deterministic tie-breaker so running rows stay stable while status updates stream.
  return left.agent.id.localeCompare(right.agent.id, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function applySidebarDefaultOrdering(
  entries: SidebarAgentListEntry[]
): { entries: SidebarAgentListEntry[]; hasMore: boolean } {
  const needsInput: SidebarAgentListEntry[] = [];
  const failed: SidebarAgentListEntry[] = [];
  const running: SidebarAgentListEntry[] = [];
  const attention: SidebarAgentListEntry[] = [];
  const done: SidebarAgentListEntry[] = [];

  for (const entry of entries) {
    const bucket = deriveSidebarStateBucket({
      status: entry.agent.status,
      requiresAttention: entry.agent.requiresAttention,
      attentionReason: entry.agent.attentionReason,
    });
    if (bucket === "needs_input") {
      needsInput.push(entry);
      continue;
    }
    if (bucket === "failed") {
      failed.push(entry);
      continue;
    }
    if (bucket === "running") {
      running.push(entry);
      continue;
    }
    if (bucket === "attention") {
      attention.push(entry);
      continue;
    }
    done.push(entry);
  }

  needsInput.sort(compareByLastActivityDesc);
  failed.sort(compareByLastActivityDesc);
  running.sort(compareByTitleAsc);
  attention.sort(compareByLastActivityDesc);
  done.sort(compareByLastActivityDesc);

  const active = [...needsInput, ...failed, ...running, ...attention];
  if (active.length >= SIDEBAR_DONE_FILL_TARGET) {
    return { entries: active, hasMore: done.length > 0 };
  }

  const remainingDoneSlots = SIDEBAR_DONE_FILL_TARGET - active.length;
  const shownDone = done.slice(0, remainingDoneSlots);
  return {
    entries: [...active, ...shownDone],
    hasMore: done.length > shownDone.length,
  };
}

function toAggregatedAgent(params: {
  source: Agent | ReturnType<typeof normalizeAgentSnapshot>;
  serverId: string;
  serverLabel: string;
}): AggregatedAgent & { createdAt: Date } {
  const source = params.source;
  return {
    id: source.id,
    serverId: params.serverId,
    serverLabel: params.serverLabel,
    title: source.title ?? null,
    status: source.status,
    createdAt: source.createdAt,
    lastActivityAt: source.lastActivityAt,
    cwd: source.cwd,
    provider: source.provider,
    requiresAttention: source.requiresAttention,
    attentionReason: source.attentionReason,
    attentionTimestamp: source.attentionTimestamp ?? null,
    archivedAt: source.archivedAt ?? null,
    labels: source.labels,
  };
}

export function useSidebarAgentsGrouped(options?: {
  isOpen?: boolean;
  serverId?: string | null;
  selectedProjectKeys?: string[];
}): SidebarAgentsGroupedResult {
  const { connectionStates } = useDaemonConnections();
  const queryClient = useQueryClient();
  const isOpen = options?.isOpen ?? true;
  const serverId = useMemo(() => {
    const value = options?.serverId;
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }, [options?.serverId]);
  const selectedProjectKeys = useMemo(
    () =>
      new Set(
        (options?.selectedProjectKeys ?? [])
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      ),
    [options?.selectedProjectKeys]
  );

  const session = useSessionStore((state) =>
    serverId ? state.sessions[serverId] : undefined
  );
  const client = session?.client ?? null;
  const liveAgents = session?.agents ?? null;
  const isConnected = session?.connection.isConnected ?? false;
  const canFetch = Boolean(serverId && client && isConnected);

  const agentsQuery = useQuery({
    queryKey: ["sidebarAgentsList", serverId] as const,
    queryFn: async () => {
      if (!client) {
        throw new Error("Daemon client not available");
      }
      return await client.fetchAgents({
        filter: { labels: { ui: "true" } },
        sort: [
          { key: "status_priority", direction: "asc" },
          { key: "updated_at", direction: "desc" },
        ],
      });
    },
    enabled: canFetch,
    staleTime: SIDEBAR_AGENTS_STALE_TIME,
    refetchInterval: isOpen ? SIDEBAR_AGENTS_REFETCH_INTERVAL : false,
    refetchIntervalInBackground: isOpen,
    refetchOnMount: "always" as const,
  });

  const { entries, projectOptions, hasAnyData, hasMoreEntries } = useMemo(() => {
    if (!serverId) {
      return {
        entries: [] as SidebarAgentListEntry[],
        projectOptions: [] as SidebarProjectOption[],
        hasAnyData: false,
        hasMoreEntries: false,
      };
    }

    const serverLabel = connectionStates.get(serverId)?.daemon.label ?? serverId;
    const seenAgentIds = new Set<string>();
    const byProject = new Map<string, SidebarProjectOption>();
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

    const fetchedEntries = agentsQuery.data?.entries ?? [];
    for (const fetchedEntry of fetchedEntries) {
      const normalized = normalizeAgentSnapshot(fetchedEntry.agent, serverId);
      const live = liveAgents?.get(fetchedEntry.agent.id);
      const project = live?.projectPlacement ?? fetchedEntry.project;
      if (!project) {
        continue;
      }
      const agent = toAggregatedAgent({
        source: live ?? normalized,
        serverId,
        serverLabel,
      });
      pushEntry({ agent, project });
    }

    if (liveAgents) {
      for (const live of liveAgents.values()) {
        if (live.archivedAt || live.labels.ui !== "true") {
          continue;
        }
        if (!live.projectPlacement) {
          continue;
        }
        const agent = toAggregatedAgent({
          source: live,
          serverId,
          serverLabel,
        });
        pushEntry({ agent, project: live.projectPlacement });
      }
    }

    const filteredEntries =
      selectedProjectKeys.size > 0
        ? mergedEntries.filter((entry) =>
            selectedProjectKeys.has(entry.project.projectKey)
          )
        : mergedEntries;

    const ordered = applySidebarDefaultOrdering(filteredEntries);
    const options = Array.from(byProject.values()).sort((left, right) => {
      if (left.activeCount !== right.activeCount) {
        return right.activeCount - left.activeCount;
      }
      return left.projectName.localeCompare(right.projectName);
    });

    return {
      entries: ordered.entries,
      projectOptions: options,
      hasAnyData: ordered.entries.length > 0,
      hasMoreEntries: ordered.hasMore,
    };
  }, [
    agentsQuery.data?.entries,
    connectionStates,
    liveAgents,
    selectedProjectKeys,
    serverId,
  ]);

  const refreshAll = useCallback(() => {
    if (!serverId) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: ["sidebarAgentsList", serverId],
    });
  }, [queryClient, serverId]);

  const isFetching =
    canFetch && (agentsQuery.isPending || agentsQuery.isFetching);
  const isInitialLoad = isFetching && !hasAnyData;
  const isRevalidating = isFetching && hasAnyData;

  return {
    entries,
    projectOptions,
    hasMoreEntries,
    isLoading: isFetching,
    isInitialLoad,
    isRevalidating,
    refreshAll,
  };
}
