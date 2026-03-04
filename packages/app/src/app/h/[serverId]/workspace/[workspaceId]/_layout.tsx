import { useLocalSearchParams, usePathname } from "expo-router";
import { WorkspaceScreen } from "@/screens/workspace/workspace-screen";
import {
  parseHostWorkspaceRouteFromPathname,
  parseHostWorkspaceTabRouteFromPathname,
} from "@/utils/host-routes";

function readNonEmptyParam(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function HostWorkspaceLayout() {
  const pathname = usePathname();
  const params = useLocalSearchParams<{ tabId?: string }>();
  const tabRoute = parseHostWorkspaceTabRouteFromPathname(pathname);
  const activeRoute = tabRoute ?? parseHostWorkspaceRouteFromPathname(pathname);
  const serverId = activeRoute?.serverId ?? "";
  const workspaceId = activeRoute?.workspaceId ?? "";
  const routeTabId = tabRoute?.tabId ?? readNonEmptyParam(params.tabId);

  return (
    <WorkspaceScreen
      serverId={serverId}
      workspaceId={workspaceId}
      routeTabId={routeTabId}
    />
  );
}
