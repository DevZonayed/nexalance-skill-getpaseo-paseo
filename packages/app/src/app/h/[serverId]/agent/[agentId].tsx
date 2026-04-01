import { useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSessionStore } from "@/stores/session-store";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { buildHostRootRoute } from "@/utils/host-routes";
import { resolveHydratedWorkspaceId } from "@/utils/resolve-hydrated-workspace-id";
import { prepareWorkspaceTab } from "@/utils/workspace-navigation";

export default function HostAgentReadyRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    serverId?: string;
    agentId?: string;
  }>();
  const redirectedRef = useRef(false);
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const agentId = typeof params.agentId === "string" ? params.agentId : "";
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const agentCwd = useSessionStore((state) => {
    if (!serverId || !agentId) {
      return null;
    }
    return state.sessions[serverId]?.agents?.get(agentId)?.cwd ?? null;
  });
  const sessionWorkspaces = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.workspaces : undefined,
  );
  const hasHydratedWorkspaces = useSessionStore((state) =>
    serverId ? (state.sessions[serverId]?.hasHydratedWorkspaces ?? false) : false,
  );
  const resolvedWorkspaceId = useSessionStore((state) => {
    if (!serverId || !agentId) {
      return null;
    }
    return resolveHydratedWorkspaceId({
      workspaces: state.sessions[serverId]?.workspaces?.values(),
      path: state.sessions[serverId]?.agents?.get(agentId)?.cwd,
    });
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

    if (resolvedWorkspaceId) {
      redirectedRef.current = true;
      router.replace(
        prepareWorkspaceTab({
          serverId,
          workspaceId: resolvedWorkspaceId,
          target: { kind: "agent", agentId },
        }) as any,
      );
    }
  }, [agentId, resolvedWorkspaceId, router, serverId]);

  useEffect(() => {
    if (redirectedRef.current) {
      return;
    }
    if (!serverId || !agentId) {
      return;
    }
    if (agentCwd?.trim() && !hasHydratedWorkspaces) {
      return;
    }
    if (!client || !isConnected) {
      redirectedRef.current = true;
      router.replace(buildHostRootRoute(serverId) as any);
    }
  }, [agentCwd, agentId, client, hasHydratedWorkspaces, isConnected, router, serverId]);

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
        const workspaceId = resolveHydratedWorkspaceId({
          workspaces: sessionWorkspaces?.values(),
          path: cwd,
        });
        if (!workspaceId && !hasHydratedWorkspaces) {
          return;
        }
        redirectedRef.current = true;
        if (workspaceId) {
          router.replace(
            prepareWorkspaceTab({
              serverId,
              workspaceId,
              target: { kind: "agent", agentId },
            }) as any,
          );
          return;
        }
        router.replace(buildHostRootRoute(serverId) as any);
      })
      .catch(() => {
        if (cancelled || redirectedRef.current) {
          return;
        }
        redirectedRef.current = true;
        router.replace(buildHostRootRoute(serverId) as any);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, client, hasHydratedWorkspaces, isConnected, router, serverId, sessionWorkspaces]);

  return null;
}
