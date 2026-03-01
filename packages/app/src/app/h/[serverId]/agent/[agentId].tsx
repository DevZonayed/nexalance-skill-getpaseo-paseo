import { useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSessionStore } from "@/stores/session-store";
import { useHostRuntimeSession } from "@/runtime/host-runtime";
import {
  buildHostDraftRoute,
  buildHostWorkspaceAgentRoute,
} from "@/utils/host-routes";

export default function HostAgentReadyRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    serverId?: string;
    agentId?: string;
  }>();
  const redirectedRef = useRef(false);
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const agentId = typeof params.agentId === "string" ? params.agentId : "";
  const { client, isConnected } = useHostRuntimeSession(serverId);
  const agentCwd = useSessionStore((state) => {
    if (!serverId || !agentId) {
      return null;
    }
    return state.sessions[serverId]?.agents?.get(agentId)?.cwd ?? null;
  });

  useEffect(() => {
    if (redirectedRef.current) {
      return;
    }
    if (!serverId || !agentId) {
      redirectedRef.current = true;
      router.replace("/" as any);
      return;
    }

    const normalizedCwd = agentCwd?.trim();
    if (normalizedCwd) {
      redirectedRef.current = true;
      router.replace(
        buildHostWorkspaceAgentRoute(serverId, normalizedCwd, agentId) as any
      );
    }
  }, [agentCwd, agentId, router, serverId]);

  useEffect(() => {
    if (redirectedRef.current) {
      return;
    }
    if (!serverId || !agentId) {
      return;
    }
    if (agentCwd?.trim()) {
      return;
    }
    if (!client || !isConnected) {
      redirectedRef.current = true;
      router.replace(buildHostDraftRoute(serverId) as any);
    }
  }, [agentCwd, agentId, client, isConnected, router, serverId]);

  useEffect(() => {
    if (redirectedRef.current) {
      return;
    }
    if (!serverId || !agentId || !client || !isConnected) {
      return;
    }

    let cancelled = false;
    void client
      .fetchAgent(agentId)
      .then((result) => {
        if (cancelled || redirectedRef.current) {
          return;
        }
        const cwd = result?.agent?.cwd?.trim();
        redirectedRef.current = true;
        if (cwd) {
          router.replace(buildHostWorkspaceAgentRoute(serverId, cwd, agentId) as any);
          return;
        }
        router.replace(buildHostDraftRoute(serverId) as any);
      })
      .catch(() => {
        if (cancelled || redirectedRef.current) {
          return;
        }
        redirectedRef.current = true;
        router.replace(buildHostDraftRoute(serverId) as any);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, client, isConnected, router, serverId]);

  return null;
}
