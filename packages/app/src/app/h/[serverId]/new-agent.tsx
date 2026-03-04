import { useLocalSearchParams } from "expo-router";
import { DraftAgentScreen } from "@/screens/agent/draft-agent-screen";

export default function HostNewAgentRoute() {
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";

  return <DraftAgentScreen forcedServerId={serverId} />;
}
