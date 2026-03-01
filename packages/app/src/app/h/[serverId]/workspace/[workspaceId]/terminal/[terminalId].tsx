import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "@/screens/workspace/workspace-screen";

export default function HostWorkspaceTerminalRoute() {
  const params = useLocalSearchParams<{
    serverId?: string;
    workspaceId?: string;
    terminalId?: string;
  }>();

  const terminalId =
    typeof params.terminalId === "string" ? params.terminalId : "";

  return (
    <WorkspaceScreen
      serverId={typeof params.serverId === "string" ? params.serverId : ""}
      workspaceId={typeof params.workspaceId === "string" ? params.workspaceId : ""}
      routeTab={terminalId ? { kind: "terminal", terminalId } : null}
    />
  );
}
