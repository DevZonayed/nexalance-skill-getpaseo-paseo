import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  AGENT_PROVIDER_DEFINITIONS,
  type AgentProviderDefinition,
} from "@server/server/agent/provider-manifest";
import type { AgentModelDefinition, AgentProvider } from "@server/server/agent/agent-sdk-types";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

const STALE_TIME = 5 * 60 * 1000;

export function useProviderModels(serverId: string) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const enabled = Boolean(serverId && client && isConnected);

  const queries = useQueries({
    queries: AGENT_PROVIDER_DEFINITIONS.map((def) => ({
      queryKey: ["providerModels", serverId, def.id] as const,
      enabled,
      staleTime: STALE_TIME,
      queryFn: async () => {
        if (!client) {
          throw new Error("Host is not connected");
        }
        const payload = await client.listProviderModels(def.id as AgentProvider);
        if (payload.error) {
          throw new Error(payload.error);
        }
        return payload.models ?? [];
      },
    })),
  });

  const allProviderModels = useMemo(() => {
    const map = new Map<string, AgentModelDefinition[]>();
    for (let i = 0; i < AGENT_PROVIDER_DEFINITIONS.length; i++) {
      const query = queries[i];
      if (query?.data) {
        map.set(AGENT_PROVIDER_DEFINITIONS[i]!.id, query.data);
      }
    }
    return map;
  }, [queries]);

  const isLoading = queries.some((q) => q.isLoading);

  return { allProviderModels, isLoading };
}
