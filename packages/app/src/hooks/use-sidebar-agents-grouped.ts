import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDaemonConnections } from "@/contexts/daemon-connections-context";
import { useSessionStore, type Agent } from "@/stores/session-store";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { normalizeAgentSnapshot } from "@/utils/agent-snapshots";
import {
  useSectionOrderStore,
  sortProjectsByStoredOrder,
} from "@/stores/section-order-store";
import type { FetchAgentsGroupedByProjectResponseMessage } from "@server/shared/messages";

const SIDEBAR_GROUPS_STALE_TIME = 15_000;
const SIDEBAR_GROUPS_REFETCH_INTERVAL = 10_000;
const MAX_AGENTS_PER_PROJECT = 5;

type SidebarGroupsPayload =
  FetchAgentsGroupedByProjectResponseMessage["payload"];
export type SidebarCheckoutLite =
  SidebarGroupsPayload["groups"][number]["agents"][number]["checkout"];
type MutableSidebarGroup = {
  projectKey: string;
  projectName: string;
  agents: AggregatedAgent[];
};

export interface SidebarSectionData {
  key: string;
  projectKey: string;
  title: string;
  agents: AggregatedAgent[];
  firstAgentServerId?: string;
  firstAgentId?: string;
  workingDir?: string;
}

export interface SidebarAgentsGroupedResult {
  sections: SidebarSectionData[];
  checkoutByAgentKey: Map<string, SidebarCheckoutLite>;
  isLoading: boolean;
  isInitialLoad: boolean;
  isRevalidating: boolean;
  refreshAll: () => void;
}

function toAggregatedAgent(params: {
  source: Agent | ReturnType<typeof normalizeAgentSnapshot>;
  serverId: string;
  serverLabel: string;
}): AggregatedAgent {
  const source = params.source;
  return {
    id: source.id,
    serverId: params.serverId,
    serverLabel: params.serverLabel,
    title: source.title ?? null,
    status: source.status,
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

  const session = useSessionStore((state) =>
    serverId ? state.sessions[serverId] : undefined
  );
  const client = session?.client ?? null;
  const liveAgents = session?.agents ?? null;
  const isConnected = session?.connection.isConnected ?? false;
  const canFetch = Boolean(serverId && client && isConnected);

  const groupedQuery = useQuery({
    queryKey: ["sidebarAgentsGrouped", serverId] as const,
    queryFn: async () => {
      if (!client) {
        throw new Error("Daemon client not available");
      }
      return await client.fetchAgentsGroupedByProject({
        filter: { labels: { ui: "true" } },
      });
    },
    enabled: canFetch,
    staleTime: SIDEBAR_GROUPS_STALE_TIME,
    refetchInterval: isOpen ? SIDEBAR_GROUPS_REFETCH_INTERVAL : false,
    refetchIntervalInBackground: isOpen,
    refetchOnMount: "always" as const,
  });

  const projectOrder = useSectionOrderStore((state) => state.projectOrder);
  const setProjectOrder = useSectionOrderStore((state) => state.setProjectOrder);

  const { sections, checkoutByAgentKey, hasAnyData } = useMemo(() => {
    if (!serverId) {
      return {
        sections: [] as SidebarSectionData[],
        checkoutByAgentKey: new Map<string, SidebarCheckoutLite>(),
        hasAnyData: false,
      };
    }

    const groupsByKey = new Map<string, MutableSidebarGroup>();
    const checkoutLookup = new Map<string, SidebarCheckoutLite>();
    const seenAgentKeys = new Set<string>();
    const payload = groupedQuery.data as SidebarGroupsPayload | undefined;
    const groupedFetchReady = groupedQuery.isFetched;
    const serverLabel = connectionStates.get(serverId)?.daemon.label ?? serverId;

    if (payload) {
      for (const group of payload.groups) {
        const existing: MutableSidebarGroup =
          groupsByKey.get(group.projectKey) ??
          {
            projectKey: group.projectKey,
            projectName: group.projectName,
            agents: [],
          };

        for (const entry of group.agents) {
          const normalized = normalizeAgentSnapshot(entry.agent, serverId);
          const live = liveAgents?.get(entry.agent.id);
          const nextAgent = toAggregatedAgent({
            source: live ?? normalized,
            serverId,
            serverLabel,
          });
          if (nextAgent.archivedAt) {
            continue;
          }

          const agentKey = `${serverId}:${entry.agent.id}`;
          seenAgentKeys.add(agentKey);
          checkoutLookup.set(
            agentKey,
            live?.projectPlacement?.checkout ?? entry.checkout
          );
          existing.agents.push(nextAgent);
        }

        groupsByKey.set(group.projectKey, existing);
      }
    }

    if (groupedFetchReady && liveAgents) {
      for (const live of liveAgents.values()) {
        if (live.archivedAt || live.labels.ui !== "true") {
          continue;
        }
        if (!live.projectPlacement) {
          // Ignore fetchAgents-hydrated snapshots for sidebar placement.
          // Sidebar should derive placement from grouped RPC or project-enriched agent_update.
          continue;
        }
        const agentKey = `${serverId}:${live.id}`;
        if (seenAgentKeys.has(agentKey)) {
          continue;
        }

        const livePlacement = live.projectPlacement;
        const projectKey = livePlacement.projectKey;
        const existing: MutableSidebarGroup =
          groupsByKey.get(projectKey) ??
          {
            projectKey,
            projectName: livePlacement.projectName,
            agents: [],
          };
        existing.agents.push(
          toAggregatedAgent({
            source: live,
            serverId,
            serverLabel,
          })
        );
        checkoutLookup.set(agentKey, livePlacement.checkout);
        groupsByKey.set(projectKey, existing);
      }
    }

    const sortedGroups = Array.from(groupsByKey.values())
      .map((group) => {
        const agents = [...group.agents].sort(
          (left, right) =>
            right.lastActivityAt.getTime() - left.lastActivityAt.getTime()
        );
        return {
          ...group,
          agents: agents.slice(0, MAX_AGENTS_PER_PROJECT),
        };
      })
      .filter((group) => group.agents.length > 0)
      .sort((left, right) => {
        const leftRecent = left.agents[0]?.lastActivityAt.getTime() ?? 0;
        const rightRecent = right.agents[0]?.lastActivityAt.getTime() ?? 0;
        return rightRecent - leftRecent;
      });

    const orderedGroups = sortProjectsByStoredOrder(sortedGroups, projectOrder);
    const nextSections = orderedGroups.map((group) => {
      const firstAgent = group.agents[0];
      return {
        key: `project:${group.projectKey}`,
        projectKey: group.projectKey,
        title: group.projectName,
        agents: group.agents,
        firstAgentServerId: firstAgent?.serverId,
        firstAgentId: firstAgent?.id,
        workingDir: firstAgent?.cwd,
      };
    });

    return {
      sections: nextSections,
      checkoutByAgentKey: checkoutLookup,
      hasAnyData: nextSections.length > 0,
    };
  }, [
    connectionStates,
    groupedQuery.data,
    groupedQuery.isFetched,
    liveAgents,
    projectOrder,
    serverId,
  ]);

  useEffect(() => {
    const currentKeys = sections.map((section) => section.projectKey);
    const storedKeys = new Set(projectOrder);
    const newKeys = currentKeys.filter((key) => !storedKeys.has(key));
    if (newKeys.length > 0) {
      setProjectOrder([...projectOrder, ...newKeys]);
    }
  }, [sections, projectOrder, setProjectOrder]);

  const refreshAll = useCallback(() => {
    if (!serverId) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: ["sidebarAgentsGrouped", serverId],
    });
  }, [queryClient, serverId]);

  const isFetching =
    canFetch && (groupedQuery.isPending || groupedQuery.isFetching);
  const isInitialLoad = isFetching && !hasAnyData;
  const isRevalidating = isFetching && hasAnyData;

  return {
    sections,
    checkoutByAgentKey,
    isLoading: isFetching,
    isInitialLoad,
    isRevalidating,
    refreshAll,
  };
}

