import { useEffect } from "react";
import { usePathname } from "expo-router";
import { Platform } from "react-native";
import { WorkspaceScreen } from "@/screens/workspace/workspace-screen";
import {
  parseHostWorkspaceRouteFromPathname,
  parseHostWorkspaceTabRouteFromPathname,
} from "@/utils/host-routes";

export default function HostWorkspaceLayout() {
  const pathname = usePathname();
  const resolvedPathname =
    Platform.OS === "web" && typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : pathname;
  const tabRoute = parseHostWorkspaceTabRouteFromPathname(resolvedPathname);
  const activeRoute = tabRoute ?? parseHostWorkspaceRouteFromPathname(resolvedPathname);
  const serverId = activeRoute?.serverId ?? "";
  const workspaceId = activeRoute?.workspaceId ?? "";
  const routeTabId = tabRoute?.tabId ?? null;

  useEffect(() => {
    if (Platform.OS !== "web" || !tabRoute || typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (!params.has("tabId") && !params.has("workspaceId") && !params.has("serverId")) {
      return;
    }
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [resolvedPathname, tabRoute]);

  return (
    <WorkspaceScreen
      key={`${serverId}:${workspaceId}`}
      serverId={serverId}
      workspaceId={workspaceId}
      routeTabId={routeTabId}
    />
  );
}
