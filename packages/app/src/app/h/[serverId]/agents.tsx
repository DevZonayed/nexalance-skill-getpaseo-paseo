import { useLocalSearchParams } from "expo-router";
import { AgentsScreen } from "@/screens/agents-screen";

export default function HostAgentsRoute() {
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";

  return <AgentsScreen serverId={serverId} />;
}
