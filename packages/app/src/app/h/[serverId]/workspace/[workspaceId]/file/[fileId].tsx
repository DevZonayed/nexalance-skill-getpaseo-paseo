import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "@/screens/workspace/workspace-screen";
import { decodeFilePathFromPathSegment } from "@/utils/host-routes";

export default function HostWorkspaceFileRoute() {
  const params = useLocalSearchParams<{
    serverId?: string;
    workspaceId?: string;
    fileId?: string;
  }>();

  const fileId = typeof params.fileId === "string" ? params.fileId : "";
  const filePath = fileId ? decodeFilePathFromPathSegment(fileId) ?? "" : "";

  return (
    <WorkspaceScreen
      serverId={typeof params.serverId === "string" ? params.serverId : ""}
      workspaceId={typeof params.workspaceId === "string" ? params.workspaceId : ""}
      routeTab={filePath ? { kind: "file", path: filePath } : null}
    />
  );
}

