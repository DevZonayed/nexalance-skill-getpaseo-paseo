import { describe, expect, it } from "vitest";
import type { WorkspaceScriptPayload } from "@server/shared/messages";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { patchWorkspaceScripts } from "./session-workspace-scripts";

function workspace(input: {
  id: string;
  scripts?: WorkspaceDescriptor["scripts"];
}): WorkspaceDescriptor {
  return {
    id: input.id,
    projectId: "project-1",
    projectDisplayName: "Project 1",
    projectRootPath: "/repo",
    workspaceDirectory: input.id,
    projectKind: "git",
    workspaceKind: "checkout",
    name: "main",
    status: "running",
    activityAt: null,
    diffStat: null,
    scripts: input.scripts ?? [],
  };
}

const runningScript: WorkspaceScriptPayload = {
  scriptName: "web",
  hostname: "main.web.localhost",
  port: 3000,
  url: "http://main.web.localhost:6767",
  lifecycle: "running",
  health: "healthy",
};

describe("patchWorkspaceScripts", () => {
  it("patches only the matching workspace scripts", () => {
    const other = workspace({ id: "/repo/other", scripts: [] });
    const current = new Map<string, WorkspaceDescriptor>([
      ["/repo/main", workspace({ id: "/repo/main", scripts: [] })],
      [other.id, other],
    ]);

    const next = patchWorkspaceScripts(current, {
      workspaceId: "/repo/main",
      scripts: [runningScript],
    });

    expect(next).not.toBe(current);
    expect(next.get("/repo/main")?.scripts).toEqual([runningScript]);
    expect(next.get("/repo/other")).toBe(other);
  });

  it("patches the matching workspace when the update uses workspace directory identity", () => {
    const current = new Map<string, WorkspaceDescriptor>([
      [
        "42",
        workspace({
          id: "42",
          scripts: [],
        }),
      ],
    ]);

    current.set("42", {
      ...current.get("42")!,
      workspaceDirectory: "C:\\repo\\main\\",
    });

    const next = patchWorkspaceScripts(current, {
      workspaceId: "C:/repo/main",
      scripts: [runningScript],
    });

    expect(next).not.toBe(current);
    expect(next.get("42")?.scripts).toEqual([runningScript]);
  });

  it("ignores updates for unknown workspaces", () => {
    const current = new Map<string, WorkspaceDescriptor>([
      ["/repo/main", workspace({ id: "/repo/main", scripts: [] })],
    ]);

    const next = patchWorkspaceScripts(current, {
      workspaceId: "/repo/missing",
      scripts: [runningScript],
    });

    expect(next).toBe(current);
    expect(next.get("/repo/main")?.scripts).toEqual([]);
  });
});
