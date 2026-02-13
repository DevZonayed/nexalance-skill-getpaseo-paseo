import type { CheckoutStatusPayload } from "@/hooks/use-checkout-status-query";
import { buildHostAgentDraftRoute } from "@/utils/host-routes";

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
