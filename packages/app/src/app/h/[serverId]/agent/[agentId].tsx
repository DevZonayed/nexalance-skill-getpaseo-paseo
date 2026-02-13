import { useLocalSearchParams } from "expo-router";
import { AgentReadyScreen } from "@/screens/agent/agent-ready-screen";

export default function HostAgentReadyRoute() {
  const params = useLocalSearchParams<{
    serverId?: string;
    agentId?: string;
  }>();

  return (
    <AgentReadyScreen
      serverId={typeof params.serverId === "string" ? params.serverId : ""}
      agentId={typeof params.agentId === "string" ? params.agentId : ""}
    />
  );
}

