import {
  parseHostAgentDraftRouteFromPathname,
  parseHostAgentRouteFromPathname,
} from "@/utils/host-routes";

const DRAFT_AGENT_ID = "__new_agent__";

export function resolveSelectedOrRouteAgentKey(input: {
  selectedAgentId?: string;
  pathname: string;
}): string | null {
  if (input.selectedAgentId) {
    return input.selectedAgentId;
  }
  const route = parseHostAgentRouteFromPathname(input.pathname);
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
  return (
    resolveSelectedOrRouteAgentKey({
      selectedAgentId: input.selectedAgentId,
      pathname: input.pathname,
    }) !== null
  );
}
