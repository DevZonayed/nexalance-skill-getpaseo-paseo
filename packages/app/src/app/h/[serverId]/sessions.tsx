import { useLocalSearchParams } from "expo-router";
import { SessionsScreen } from "@/screens/sessions-screen";

export default function HostAgentsRoute() {
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";

  return <SessionsScreen serverId={serverId} />;
}
