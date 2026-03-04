import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSessionStore } from "@/stores/session-store";
import { useFormPreferences } from "@/hooks/use-form-preferences";
import {
  buildHostWorkspaceRoute,
  buildHostWorkspaceAgentTabRoute,
} from "@/utils/host-routes";

export default function HostIndexRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const { preferences, isLoading: preferencesLoading } = useFormPreferences();
  const sessionAgents = useSessionStore(
    (state) => (serverId ? state.sessions[serverId]?.agents : undefined)
  );

  useEffect(() => {
    if (preferencesLoading) {
      return;
    }
    if (!serverId) {
      return;
    }

    const visibleAgents = sessionAgents
      ? Array.from(sessionAgents.values()).filter(
          (agent) => !agent.archivedAt
        )
      : [];
    visibleAgents.sort(
      (left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime()
    );

    const primaryAgent = visibleAgents[0];
    if (primaryAgent?.cwd?.trim()) {
      router.replace(
        buildHostWorkspaceAgentTabRoute(
          serverId,
          primaryAgent.cwd.trim(),
          primaryAgent.id
        ) as any
      );
      return;
    }

    const preferredWorkingDir =
      preferences.serverId === serverId ? preferences.workingDir?.trim() : "";
    const workspaceId = preferredWorkingDir || ".";
    router.replace(buildHostWorkspaceRoute(serverId, workspaceId) as any);
  }, [preferences.serverId, preferences.workingDir, preferencesLoading, router, serverId, sessionAgents]);

  return null;
}
