import { describe, expect, it } from "vitest";
import {
  buildHostWorkspaceRoute,
  buildHostWorkspaceTabRoute,
} from "@/utils/host-routes";
import { resolveWorkspaceTabCanonicalPath } from "@/screens/workspace/workspace-route-canonicalization";

describe("resolveWorkspaceTabCanonicalPath", () => {
  it("canonicalizes workspace root routes to /tab/<tabId> when a tab is active", () => {
    const serverId = "local";
    const workspaceId = "/tmp/repo";

    expect(
      resolveWorkspaceTabCanonicalPath({
        activeTabId: "draft_abc123",
        pathname: buildHostWorkspaceRoute(serverId, workspaceId),
        serverId,
        workspaceId,
      })
    ).toBe(buildHostWorkspaceTabRoute(serverId, workspaceId, "draft_abc123"));
  });

  it("does not skip canonical path detection due to query-string tabId", () => {
    const serverId = "local";
    const workspaceId = "/tmp/repo";

    expect(
      resolveWorkspaceTabCanonicalPath({
        activeTabId: "draft_abc123",
        pathname: `${buildHostWorkspaceRoute(serverId, workspaceId)}?tabId=draft_abc123`,
        serverId,
        workspaceId,
      })
    ).toBe(buildHostWorkspaceTabRoute(serverId, workspaceId, "draft_abc123"));
  });

  it("strips redundant query params from canonical /tab routes", () => {
    const serverId = "local";
    const workspaceId = "/tmp/repo";
    const canonicalPath = buildHostWorkspaceTabRoute(
      serverId,
      workspaceId,
      "draft_abc123"
    );

    expect(
      resolveWorkspaceTabCanonicalPath({
        activeTabId: "draft_abc123",
        pathname: `${canonicalPath}?tabId=not_used`,
        serverId,
        workspaceId,
      })
    ).toBe(canonicalPath);
  });

  it("does nothing when the pathname is exactly canonical", () => {
    const serverId = "local";
    const workspaceId = "/tmp/repo";
    const canonicalPath = buildHostWorkspaceTabRoute(
      serverId,
      workspaceId,
      "draft_abc123"
    );

    expect(
      resolveWorkspaceTabCanonicalPath({
        activeTabId: "draft_abc123",
        pathname: canonicalPath,
        serverId,
        workspaceId,
      })
    ).toBeNull();
  });

  it("does not canonicalize when the pathname belongs to another workspace", () => {
    const serverId = "local";
    const workspaceId = "/tmp/repo";
    const otherWorkspacePath = buildHostWorkspaceRoute(serverId, "/tmp/other");

    expect(
      resolveWorkspaceTabCanonicalPath({
        activeTabId: "draft_abc123",
        pathname: otherWorkspacePath,
        serverId,
        workspaceId,
      })
    ).toBeNull();
  });
});
