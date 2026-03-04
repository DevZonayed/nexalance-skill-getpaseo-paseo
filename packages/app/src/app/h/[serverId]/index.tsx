import { useEffect } from "react";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { Platform } from "react-native";
import { useSessionStore } from "@/stores/session-store";
import { useFormPreferences } from "@/hooks/use-form-preferences";
import {
  buildHostRootRoute,
  buildHostWorkspaceRoute,
  buildHostWorkspaceAgentTabRoute,
  buildHostWorkspaceTabRoute,
  parseHostWorkspaceTabRouteFromPathname,
} from "@/utils/host-routes";

const HOST_ROOT_REDIRECT_DELAY_MS = 300;

function readInitialNavigationPathname(): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const name = typeof entry?.name === "string" ? entry.name : null;
  if (!name) {
    return null;
  }
  try {
    return new URL(name).pathname;
  } catch {
    return null;
  }
}

export default function HostIndexRoute() {
  const router = useRouter();
  const routerPathname = usePathname();
  const pathname =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.pathname
      : routerPathname;
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
    const rootRoute = buildHostRootRoute(serverId);
    if (pathname !== rootRoute && pathname !== `${rootRoute}/`) {
      return;
    }
    const timer = setTimeout(() => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const currentPathname = window.location.pathname;
        if (currentPathname !== rootRoute && currentPathname !== `${rootRoute}/`) {
          return;
        }

        const initialPathname = readInitialNavigationPathname();
        const initialWorkspaceTabRoute = initialPathname
          ? parseHostWorkspaceTabRouteFromPathname(initialPathname)
          : null;
        if (
          initialWorkspaceTabRoute &&
          initialWorkspaceTabRoute.serverId === serverId
        ) {
          const canonicalInitialTabPath = buildHostWorkspaceTabRoute(
            initialWorkspaceTabRoute.serverId,
            initialWorkspaceTabRoute.workspaceId,
            initialWorkspaceTabRoute.tabId
          );
          if (
            canonicalInitialTabPath !== "/" &&
            window.location.pathname !== canonicalInitialTabPath
          ) {
            router.replace(canonicalInitialTabPath as any);
          }
          return;
        }
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
    }, HOST_ROOT_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    pathname,
    preferences.serverId,
    preferences.workingDir,
    preferencesLoading,
    router,
    serverId,
    sessionAgents,
  ]);

  return null;
}
