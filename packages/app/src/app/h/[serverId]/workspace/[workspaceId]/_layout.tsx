import { useEffect, useRef } from "react";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { WorkspaceScreen } from "@/screens/workspace/workspace-screen";
import {
  buildHostWorkspaceRoute,
  parseHostWorkspaceRouteFromPathname,
  parseWorkspaceOpenIntent,
  type WorkspaceOpenIntent,
} from "@/utils/host-routes";
import { prepareWorkspaceTab } from "@/utils/workspace-navigation";

function getParamValue(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const firstValue = value[0];
    return typeof firstValue === "string" ? firstValue.trim() : "";
  }
  return "";
}

function getOpenIntentTarget(openIntent: WorkspaceOpenIntent): WorkspaceTabTarget {
  if (openIntent.kind === "agent") {
    return { kind: "agent", agentId: openIntent.agentId };
  }
  if (openIntent.kind === "terminal") {
    return { kind: "terminal", terminalId: openIntent.terminalId };
  }
  if (openIntent.kind === "file") {
    return { kind: "file", path: openIntent.path };
  }
  if (openIntent.kind === "setup") {
    return { kind: "setup", workspaceId: openIntent.workspaceId };
  }
  return { kind: "draft", draftId: openIntent.draftId };
}

export default function HostWorkspaceLayout() {
  const router = useRouter();
  const consumedIntentRef = useRef<string | null>(null);
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{
    open?: string | string[];
  }>();
  const parsedWorkspaceRoute = parseHostWorkspaceRouteFromPathname(pathname);
  const serverId = parsedWorkspaceRoute?.serverId ?? "";
  const workspaceId = parsedWorkspaceRoute?.workspaceId ?? "";
  const openValue = getParamValue(globalParams.open);

  useEffect(() => {
    if (!openValue) {
      return;
    }

    const consumptionKey = `${serverId}:${workspaceId}:${openValue}`;
    if (consumedIntentRef.current === consumptionKey) {
      return;
    }
    consumedIntentRef.current = consumptionKey;

    const openIntent = parseWorkspaceOpenIntent(openValue);
    const route = openIntent
      ? prepareWorkspaceTab({
          serverId,
          workspaceId,
          target: getOpenIntentTarget(openIntent),
          pin: openIntent.kind === "agent",
        })
      : buildHostWorkspaceRoute(serverId, workspaceId);

    router.replace(route as any);
  }, [openValue, router, serverId, workspaceId]);

  if (openValue) {
    return null;
  }

  return (
    <WorkspaceScreen
      key={`${serverId}:${workspaceId}`}
      serverId={serverId}
      workspaceId={workspaceId}
    />
  );
}
