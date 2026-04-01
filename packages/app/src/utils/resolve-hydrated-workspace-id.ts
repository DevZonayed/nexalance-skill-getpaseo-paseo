import type { WorkspaceDescriptor } from "@/stores/session-store";
import { normalizeWorkspaceIdentity } from "@/utils/workspace-identity";

export function resolveHydratedWorkspaceId(input: {
  workspaces: Iterable<WorkspaceDescriptor> | null | undefined;
  path: string | null | undefined;
}): string | null {
  const normalizedPath = normalizeWorkspaceIdentity(input.path);
  if (!normalizedPath) {
    return null;
  }

  for (const workspace of input.workspaces ?? []) {
    if (normalizeWorkspaceIdentity(workspace.id) === normalizedPath) {
      return workspace.id;
    }
    if (normalizeWorkspaceIdentity(workspace.workspaceDirectory) === normalizedPath) {
      return workspace.id;
    }
    if (normalizeWorkspaceIdentity(workspace.projectRootPath) === normalizedPath) {
      return workspace.id;
    }
  }

  return null;
}
