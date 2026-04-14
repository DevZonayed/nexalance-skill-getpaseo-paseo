import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderSnapshotEntry } from "@server/server/agent/agent-sdk-types";
import type { DaemonClient } from "@server/client/daemon-client";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionForServer } from "./use-session-directory";
import { queryClient as singletonQueryClient } from "@/query/query-client";

function normalizeProvidersSnapshotCwdKey(cwd?: string | null): string | null {
  const trimmed = cwd?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

export function providersSnapshotQueryKey(serverId: string | null, cwd?: string | null) {
  return ["providersSnapshot", serverId, normalizeProvidersSnapshotCwdKey(cwd)] as const;
}

interface UseProvidersSnapshotResult {
  entries: ProviderSnapshotEntry[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  supportsSnapshot: boolean;
  refresh: () => void;
  invalidate: () => void;
}

export function useProvidersSnapshot(
  serverId: string | null,
  cwd?: string | null,
): UseProvidersSnapshotResult {
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(serverId ?? "");
  const isConnected = useHostRuntimeIsConnected(serverId ?? "");
  const normalizedCwd = cwd?.trim() || undefined;
  const normalizedCwdKey = normalizeProvidersSnapshotCwdKey(normalizedCwd);
  const supportsSnapshot = useSessionForServer(
    serverId,
    (session) => session?.serverInfo?.features?.providersSnapshot === true,
  );

  const queryKey = useMemo(
    () => providersSnapshotQueryKey(serverId, normalizedCwdKey),
    [normalizedCwdKey, serverId],
  );

  const snapshotQuery = useQuery({
    queryKey,
    enabled: Boolean(supportsSnapshot && serverId && client && isConnected),
    staleTime: 60_000,
    queryFn: async () => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return client.getProvidersSnapshot({ cwd: normalizedCwd });
    },
  });

  useEffect(() => {
    if (!supportsSnapshot || !client || !isConnected || !serverId) {
      return;
    }

    return client.on("providers_snapshot_update", (message) => {
      if (message.type !== "providers_snapshot_update") {
        return;
      }
      const messageCwdKey = normalizeProvidersSnapshotCwdKey(message.payload.cwd);
      if (messageCwdKey !== normalizedCwdKey) {
        return;
      }
      queryClient.setQueryData(queryKey, {
        entries: message.payload.entries,
        generatedAt: message.payload.generatedAt,
        requestId: "providers_snapshot_update",
      });
    });
  }, [client, isConnected, normalizedCwdKey, queryClient, queryKey, serverId, supportsSnapshot]);

  const refresh = useCallback(() => {
    if (!client) {
      return;
    }
    void client.refreshProvidersSnapshot({ cwd: normalizedCwd });
  }, [client, normalizedCwd]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    entries: snapshotQuery.data?.entries ?? undefined,
    isLoading: snapshotQuery.isLoading,
    isFetching: snapshotQuery.isFetching,
    error: snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null,
    supportsSnapshot,
    refresh,
    invalidate,
  };
}

export function prefetchProvidersSnapshot(
  serverId: string,
  client: DaemonClient,
  cwd?: string | null,
): void {
  const normalizedCwd = cwd?.trim() || undefined;
  const queryKey = providersSnapshotQueryKey(serverId, normalizedCwd);
  void singletonQueryClient.prefetchQuery({
    queryKey,
    staleTime: 60_000,
    queryFn: () => client.getProvidersSnapshot({ cwd: normalizedCwd }),
  });
}
