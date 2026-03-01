import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "@/screens/workspace/workspace-screen";

export default function HostWorkspaceAgentRoute() {
  const params = useLocalSearchParams<{
    serverId?: string;
    workspaceId?: string;
    agentId?: string;
  }>();

  const agentId = typeof params.agentId === "string" ? params.agentId : "";

  return (
    <WorkspaceScreen
      serverId={typeof params.serverId === "string" ? params.serverId : ""}
      workspaceId={typeof params.workspaceId === "string" ? params.workspaceId : ""}
      routeTab={agentId ? { kind: "agent", agentId } : null}
    />
  );
}
