import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { buildHostAgentDraftRoute } from "@/utils/host-routes";

export default function HostIndexRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";

  useEffect(() => {
    if (!serverId) {
      return;
    }
    router.replace(buildHostAgentDraftRoute(serverId) as any);
  }, [router, serverId]);

  return null;
}

