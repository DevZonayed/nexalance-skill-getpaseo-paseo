import { describe, expect, it } from "vitest";
import {
  buildHostNewAgentRoute,
  buildHostRootRoute,
  buildHostWorkspaceAgentTabRoute,
  buildHostWorkspaceFileTabRoute,
  buildHostWorkspaceRoute,
  buildHostWorkspaceTerminalTabRoute,
  decodeFilePathFromPathSegment,
  decodeWorkspaceIdFromPathSegment,
  encodeFilePathForPathSegment,
  encodeWorkspaceIdForPathSegment,
  parseHostAgentRouteFromPathname,
  parseHostWorkspaceTabRouteFromPathname,
  parseHostWorkspaceRouteFromPathname,
} from "./host-routes";

describe("parseHostAgentRouteFromPathname", () => {
  it("continues parsing detail routes", () => {
    expect(parseHostAgentRouteFromPathname("/h/local/agent/abc123")).toEqual({
      serverId: "local",
      agentId: "abc123",
    });
  });
});

describe("workspace route parsing", () => {
  it("encodes workspace IDs as base64url (no padding)", () => {
    expect(encodeWorkspaceIdForPathSegment("/tmp/repo")).toBe("L3RtcC9yZXBv");
    expect(decodeWorkspaceIdFromPathSegment("L3RtcC9yZXBv")).toBe("/tmp/repo");
  });

  it("decodes non-canonical base64url workspace IDs used by older links", () => {
    expect(
      decodeWorkspaceIdFromPathSegment("L1VzZXJzL21vYm91ZHJhL2Rldi9wYXNlby")
    ).toBe("/Users/moboudra/dev/paseo");
  });

  it("encodes file paths as base64url (no padding)", () => {
    const encoded = encodeFilePathForPathSegment("src/index.ts");
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFilePathFromPathSegment(encoded)).toBe("src/index.ts");
  });

  it("parses workspace route", () => {
    expect(parseHostWorkspaceRouteFromPathname("/h/local/workspace/L3RtcC9yZXBv")).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
    });
  });

  it("parses workspace route for /tab targets", () => {
    expect(
      parseHostWorkspaceRouteFromPathname("/h/local/workspace/L3RtcC9yZXBv/tab/draft_abc123")
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
    });
  });

  it("parses workspace tab route", () => {
    expect(
      parseHostWorkspaceTabRouteFromPathname("/h/local/workspace/L3RtcC9yZXBv/tab/draft_abc123")
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
      tabId: "draft_abc123",
    });
  });

  it("builds base64url workspace routes", () => {
    expect(buildHostWorkspaceRoute("local", "/tmp/repo")).toBe("/h/local/workspace/L3RtcC9yZXBv");
  });

  it("builds host root routes", () => {
    expect(buildHostRootRoute("local")).toBe("/h/local");
  });

  it("builds host new-agent routes", () => {
    expect(buildHostNewAgentRoute("local")).toBe("/h/local/new-agent");
  });

  it("builds workspace agent tab routes", () => {
    expect(buildHostWorkspaceAgentTabRoute("local", "/tmp/repo", "agent-1")).toBe(
      "/h/local/workspace/L3RtcC9yZXBv/tab/agent_agent-1"
    );
  });

  it("builds workspace terminal tab routes", () => {
    expect(buildHostWorkspaceTerminalTabRoute("local", "/tmp/repo", "term-1")).toBe(
      "/h/local/workspace/L3RtcC9yZXBv/tab/terminal_term-1"
    );
  });

  it("builds workspace file tab routes", () => {
    expect(buildHostWorkspaceFileTabRoute("local", "/tmp/repo", "src/index.ts")).toBe(
      "/h/local/workspace/L3RtcC9yZXBv/tab/file_src%2Findex.ts"
    );
  });
});
