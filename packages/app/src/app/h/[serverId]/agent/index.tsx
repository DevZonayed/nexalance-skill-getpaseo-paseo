import { useEffect, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { buildHostDraftRoute } from "@/utils/host-routes";

export default function HostDraftAgentRoute() {
  const router = useRouter();
  const params = useLocalSearchParams() as Record<
    string,
    string | string[] | undefined
  >;
  const serverId = typeof params.serverId === "string" ? params.serverId : "";

  const redirectRoute = useMemo(() => {
    if (!serverId) {
      return "/";
    }

    const next = buildHostDraftRoute(serverId);
    const queryParts: string[] = [];
    for (const key in params) {
      const value = params[key];
      if (key === "serverId") {
        continue;
      }
      if (typeof value === "string") {
        queryParts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        );
        continue;
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          queryParts.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(entry)}`
          );
        }
      }
    }
    const queryString = queryParts.join("&");
    return queryString.length > 0 ? `${next}?${queryString}` : next;
  }, [params, serverId]);

  useEffect(() => {
    router.replace(redirectRoute as any);
  }, [redirectRoute, router]);

  return null;
}
