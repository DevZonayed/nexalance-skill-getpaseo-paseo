import {
  parseHostAgentRouteFromPathname,
  parseHostWorkspaceOpenIntentFromPathname,
  parseHostWorkspaceRouteFromPathname,
} from "@/utils/host-routes";

export function resolveSelectedOrRouteAgentKey(input: {
  selectedAgentId?: string;
  pathname: string;
}): string | null {
  if (input.selectedAgentId) {
    return input.selectedAgentId;
  }

  const workspaceRoute = parseHostWorkspaceRouteFromPathname(input.pathname);
  const workspaceOpenIntent = parseHostWorkspaceOpenIntentFromPathname(input.pathname);
  if (workspaceRoute && workspaceOpenIntent) {
    if (workspaceOpenIntent.kind === "agent") {
      const agentId = workspaceOpenIntent.agentId.trim();
      return agentId ? `${workspaceRoute.serverId}:${agentId}` : null;
    }
    if (workspaceOpenIntent.kind === "draft") {
      const draftId = workspaceOpenIntent.draftId.trim();
      return draftId ? `${workspaceRoute.serverId}:${draftId}` : null;
    }
  }

  const route = parseHostAgentRouteFromPathname(input.pathname);
  if (!route) {
    return null;
  }
  return `${route.serverId}:${route.agentId}`;
}

export function canToggleFileExplorerShortcut(input: {
  selectedAgentId?: string;
  pathname: string;
  toggleFileExplorer?: () => void;
}): boolean {
  if (!input.toggleFileExplorer) {
    return false;
  }
  if (parseHostWorkspaceRouteFromPathname(input.pathname)) {
    return true;
  }

  if (parseHostAgentRouteFromPathname(input.pathname)) {
    return true;
  }

  return false;
}
