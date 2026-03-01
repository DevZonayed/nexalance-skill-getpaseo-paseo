import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "@/screens/workspace/workspace-screen";

export default function HostWorkspaceIndexRoute() {
  const params = useLocalSearchParams<{ serverId?: string; workspaceId?: string }>();

  return (
    <WorkspaceScreen
      serverId={typeof params.serverId === "string" ? params.serverId : ""}
      workspaceId={typeof params.workspaceId === "string" ? params.workspaceId : ""}
      routeTab={null}
    />
  );
}
