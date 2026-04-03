import type { WorkspaceDescriptor } from "@/stores/session-store";
import { normalizeWorkspaceIdentity } from "@/utils/workspace-identity";

export type WorkspaceAuthorityResult = {
  workspaceId: string;
  workspaceDirectory: string;
  workspace: WorkspaceDescriptor;
};

export type WorkspaceExecutionAuthorityFailureReason =
  | "workspace_id_missing"
  | "workspace_missing"
  | "workspace_directory_missing";

export type WorkspaceExecutionAuthorityResult =
  | { ok: true; authority: WorkspaceAuthorityResult }
  | {
      ok: false;
      reason: WorkspaceExecutionAuthorityFailureReason;
      message: string;
    };

export function resolveWorkspaceRouteId(input: {
  routeWorkspaceId: string | null | undefined;
}): string | null {
  return normalizeWorkspaceIdentity(input.routeWorkspaceId);
}

export function resolveWorkspaceIdByExecutionDirectory(input: {
  workspaces: Iterable<WorkspaceDescriptor> | null | undefined;
  workspaceDirectory: string | null | undefined;
}): string | null {
  const normalizedWorkspaceDirectory = normalizeWorkspaceIdentity(input.workspaceDirectory);
  if (!normalizedWorkspaceDirectory) {
    return null;
  }

  for (const workspace of input.workspaces ?? []) {
    if (normalizeWorkspaceIdentity(workspace.workspaceDirectory) === normalizedWorkspaceDirectory) {
      return workspace.id;
    }
  }

  return null;
}

export function resolveWorkspaceMapKeyByIdentity(input: {
  workspaces: Map<string, WorkspaceDescriptor> | null | undefined;
  workspaceIdentity: string | null | undefined;
}): string | null {
  const normalizedWorkspaceIdentity = normalizeWorkspaceIdentity(input.workspaceIdentity);
  if (!normalizedWorkspaceIdentity) {
    return null;
  }

  const workspaces = input.workspaces;
  if (!workspaces) {
    return null;
  }

  if (workspaces.has(normalizedWorkspaceIdentity)) {
    return normalizedWorkspaceIdentity;
  }

  for (const [workspaceKey, workspace] of workspaces) {
    if (
      normalizeWorkspaceIdentity(workspace.id) === normalizedWorkspaceIdentity ||
      normalizeWorkspaceIdentity(workspace.workspaceDirectory) === normalizedWorkspaceIdentity
    ) {
      return workspaceKey;
    }
  }

  return null;
}

export function getWorkspaceExecutionAuthority(
  input:
    | {
        workspace: WorkspaceDescriptor | null | undefined;
      }
    | {
        workspaces: Map<string, WorkspaceDescriptor> | undefined;
        workspaceId: string | null | undefined;
      },
): WorkspaceExecutionAuthorityResult {
  const workspace =
    "workspace" in input
      ? input.workspace
      : (() => {
          const workspaceKey = resolveWorkspaceMapKeyByIdentity({
            workspaces: input.workspaces,
            workspaceIdentity: input.workspaceId,
          });
          if (!workspaceKey) {
            return null;
          }
          return input.workspaces?.get(workspaceKey) ?? null;
        })();

  if ("workspaces" in input) {
    const normalizedWorkspaceId = normalizeWorkspaceIdentity(input.workspaceId);
    if (!normalizedWorkspaceId) {
      return {
        ok: false,
        reason: "workspace_id_missing",
        message: "Workspace id is required.",
      };
    }
  }

  if (!workspace) {
    return {
      ok: false,
      reason: "workspace_missing",
      message:
        "workspaces" in input
          ? `Workspace not found: ${String(input.workspaceId ?? "")}`
          : "Workspace not found.",
    };
  }

  const workspaceDirectory = normalizeWorkspaceIdentity(workspace.workspaceDirectory);
  if (!workspaceDirectory) {
    return {
      ok: false,
      reason: "workspace_directory_missing",
      message: `Workspace directory is missing for workspace ${workspace.id}`,
    };
  }

  return {
    ok: true,
    authority: {
      workspaceId: workspace.id,
      workspaceDirectory,
      workspace,
    },
  };
}

export function requireWorkspaceExecutionAuthority(
  input:
    | {
        workspace: WorkspaceDescriptor | null | undefined;
      }
    | {
        workspaces: Map<string, WorkspaceDescriptor> | undefined;
        workspaceId: string | null | undefined;
      },
): WorkspaceAuthorityResult {
  const result = getWorkspaceExecutionAuthority(input);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.authority;
}

export function requireWorkspaceRecordId(workspaceId: string): number {
  const normalizedWorkspaceId = normalizeWorkspaceIdentity(workspaceId);
  if (!normalizedWorkspaceId) {
    throw new Error("Workspace ID is required");
  }

  const parsedWorkspaceId = Number(normalizedWorkspaceId);
  if (!Number.isInteger(parsedWorkspaceId)) {
    throw new Error(`Workspace ID is not a persisted record ID: ${workspaceId}`);
  }

  return parsedWorkspaceId;
}

export function resolveWorkspaceExecutionDirectory(input: {
  workspaceDirectory: string | null | undefined;
}): string | null {
  return normalizeWorkspaceIdentity(input.workspaceDirectory);
}

export function requireWorkspaceExecutionDirectory(input: {
  workspaceId?: string;
  workspaceDirectory: string | null | undefined;
}): string {
  const workspaceDirectory = resolveWorkspaceExecutionDirectory({
    workspaceDirectory: input.workspaceDirectory,
  });
  if (!workspaceDirectory) {
    throw new Error(
      input.workspaceId
        ? `Workspace directory is missing for workspace ${input.workspaceId}`
        : "Workspace directory is missing.",
    );
  }
  return workspaceDirectory;
}

export function resolveWorkspaceExecutionAuthority(
  input:
    | {
        workspace: WorkspaceDescriptor | null | undefined;
      }
    | {
        workspaces: Map<string, WorkspaceDescriptor> | undefined;
        workspaceId: string | null | undefined;
      },
): WorkspaceAuthorityResult | null {
  const result = getWorkspaceExecutionAuthority(input);
  return result.ok ? result.authority : null;
}

export const parseWorkspaceRecordId = requireWorkspaceRecordId;
