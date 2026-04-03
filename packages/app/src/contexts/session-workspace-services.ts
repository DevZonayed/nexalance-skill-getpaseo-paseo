import type { ServiceStatusUpdateMessage } from "@server/shared/messages";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-execution";

export function patchWorkspaceServices(
  workspaces: Map<string, WorkspaceDescriptor>,
  update: ServiceStatusUpdateMessage["payload"],
): Map<string, WorkspaceDescriptor> {
  const workspaceKey = resolveWorkspaceMapKeyByIdentity({
    workspaces,
    workspaceIdentity: update.workspaceId,
  });
  if (!workspaceKey) {
    return workspaces;
  }

  const existing = workspaces.get(workspaceKey);
  if (!existing) {
    return workspaces;
  }

  const next = new Map(workspaces);
  next.set(workspaceKey, {
    ...existing,
    services: update.services.map((s) => ({ ...s })),
  });
  return next;
}
