import { usePathname } from "expo-router";
import { Platform } from "react-native";
import { WorkspaceScreen } from "@/screens/workspace/workspace-screen";
import {
  parseHostWorkspaceOpenIntentFromPathname,
  parseHostWorkspaceRouteFromPathname,
} from "@/utils/host-routes";

export default function HostWorkspaceLayout() {
  const pathname = usePathname();
  const resolvedPathname =
    Platform.OS === "web" && typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : pathname;
  const activeRoute = parseHostWorkspaceRouteFromPathname(resolvedPathname);
  const serverId = activeRoute?.serverId ?? "";
  const workspaceId = activeRoute?.workspaceId ?? "";
  const openIntent = parseHostWorkspaceOpenIntentFromPathname(resolvedPathname);

  return (
    <WorkspaceScreen
      key={`${serverId}:${workspaceId}`}
      serverId={serverId}
      workspaceId={workspaceId}
      openIntent={openIntent}
    />
  );
}
