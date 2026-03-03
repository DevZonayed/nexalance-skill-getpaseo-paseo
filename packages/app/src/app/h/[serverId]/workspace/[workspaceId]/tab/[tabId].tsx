import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "@/screens/workspace/workspace-screen";

export default function HostWorkspaceTabRoute() {
  const params = useLocalSearchParams<{
    serverId?: string;
    workspaceId?: string;
    tabId?: string;
  }>();

  const tabId = typeof params.tabId === "string" ? params.tabId : "";

  return (
    <WorkspaceScreen
      serverId={typeof params.serverId === "string" ? params.serverId : ""}
      workspaceId={typeof params.workspaceId === "string" ? params.workspaceId : ""}
      routeTab={null}
      routeTabId={tabId || null}
    />
  );
}

