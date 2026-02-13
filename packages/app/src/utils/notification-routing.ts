import {
  buildHostAgentDetailRoute,
  buildHostAgentDraftRoute,
} from "@/utils/host-routes";

type NotificationData = Record<string, unknown> | null | undefined;

function readNonEmptyString(
  data: NotificationData,
  key: string
): string | null {
  const value = data?.[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveNotificationTarget(data: NotificationData): {
  serverId: string | null;
  agentId: string | null;
} {
  return {
    serverId: readNonEmptyString(data, "serverId"),
    agentId: readNonEmptyString(data, "agentId"),
  };
}

export function buildNotificationRoute(data: NotificationData): string {
  const { serverId, agentId } = resolveNotificationTarget(data);
  if (serverId && agentId) {
    return buildHostAgentDetailRoute(serverId, agentId);
  }
  if (serverId) {
    return buildHostAgentDraftRoute(serverId);
  }
  return "/";
}
