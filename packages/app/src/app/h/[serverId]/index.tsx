import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSessionStore } from "@/stores/session-store";
import {
  buildHostDraftRoute,
  buildHostWorkspaceAgentRoute,
} from "@/utils/host-routes";

export default function HostIndexRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const sessionAgents = useSessionStore(
    (state) => (serverId ? state.sessions[serverId]?.agents : undefined)
  );

  useEffect(() => {
    if (!serverId) {
      return;
    }

    const visibleAgents = sessionAgents
      ? Array.from(sessionAgents.values()).filter(
          (agent) => !agent.archivedAt && agent.labels.ui === "true"
        )
      : [];
    visibleAgents.sort(
      (left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime()
    );

    const primaryAgent = visibleAgents[0];
    if (primaryAgent?.cwd?.trim()) {
      router.replace(
        buildHostWorkspaceAgentRoute(
          serverId,
          primaryAgent.cwd.trim(),
          primaryAgent.id
        ) as any
      );
      return;
    }

    router.replace(buildHostDraftRoute(serverId) as any);
  }, [router, serverId, sessionAgents]);

  return null;
}
