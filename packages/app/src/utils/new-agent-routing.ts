import type { CheckoutStatusPayload } from "@/hooks/use-checkout-status-query";
import {
  buildHostAgentDraftRoute,
  parseHostAgentRouteFromPathname,
} from "@/utils/host-routes";

export function parseAgentKey(
  key: string | null | undefined
): { serverId: string; agentId: string } | null {
  if (!key) {
    return null;
  }
  const sep = key.lastIndexOf(":");
  if (sep <= 0 || sep >= key.length - 1) {
    return null;
  }
  const serverId = key.slice(0, sep).trim();
  const agentId = key.slice(sep + 1).trim();
  if (!serverId || !agentId) {
    return null;
  }
  return { serverId, agentId };
}

export function resolveSelectedAgentForNewAgent(input: {
  pathname: string;
  selectedAgentId?: string;
}): { serverId: string; agentId: string } | null {
  return (
    parseHostAgentRouteFromPathname(input.pathname) ??
    parseAgentKey(input.selectedAgentId)
  );
}

export function resolveNewAgentWorkingDir(
  cwd: string,
  checkout: CheckoutStatusPayload | null
): string {
  return (checkout?.isPaseoOwnedWorktree ? checkout.mainRepoRoot : null) ?? cwd;
}

export function buildNewAgentRoute(
  serverId: string,
  workingDir?: string | null
): string {
  const baseRoute = buildHostAgentDraftRoute(serverId);
  if (baseRoute === "/") {
    return baseRoute;
  }
  const trimmedWorkingDir = workingDir?.trim();
  if (!trimmedWorkingDir) {
    return baseRoute;
  }
  return `${baseRoute}?workingDir=${encodeURIComponent(trimmedWorkingDir)}`;
}
