import {
  parseHostAgentDraftRouteFromPathname,
  parseHostAgentRouteFromPathname,
  parseHostWorkspaceAgentRouteFromPathname,
  parseHostWorkspaceRouteFromPathname,
} from "@/utils/host-routes";

const DRAFT_AGENT_ID = "__new_agent__";

export function resolveSelectedOrRouteAgentKey(input: {
  selectedAgentId?: string;
  pathname: string;
}): string | null {
  if (input.selectedAgentId) {
    return input.selectedAgentId;
  }
  const route =
    parseHostWorkspaceAgentRouteFromPathname(input.pathname) ??
    parseHostAgentRouteFromPathname(input.pathname);
  if (!route) {
    const draftRoute = parseHostAgentDraftRouteFromPathname(input.pathname);
    if (!draftRoute) {
      return null;
    }
    return `${draftRoute.serverId}:${DRAFT_AGENT_ID}`;
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

  if (parseHostAgentDraftRouteFromPathname(input.pathname)) {
    return true;
  }

  return false;
}
