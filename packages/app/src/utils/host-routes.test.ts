import { describe, expect, it } from "vitest";
import {
  buildHostWorkspaceRoute,
  buildHostWorkspaceFileRoute,
  decodeFilePathFromPathSegment,
  decodeWorkspaceIdFromPathSegment,
  encodeFilePathForPathSegment,
  encodeWorkspaceIdForPathSegment,
  parseHostAgentDraftRouteFromPathname,
  parseHostAgentRouteFromPathname,
  parseHostDraftRouteFromPathname,
  parseHostWorkspaceAgentRouteFromPathname,
  parseHostWorkspaceFileRouteFromPathname,
  parseHostWorkspaceTabRouteFromPathname,
  parseHostWorkspaceTerminalRouteFromPathname,
  parseHostWorkspaceRouteFromPathname,
} from "./host-routes";

describe("parseHostAgentDraftRouteFromPathname", () => {
  it("parses draft route server id", () => {
    expect(parseHostAgentDraftRouteFromPathname("/h/local/new")).toEqual({
      serverId: "local",
    });
  });

  it("parses encoded server id", () => {
    expect(
      parseHostAgentDraftRouteFromPathname("/h/team%20host/new")
    ).toEqual({
      serverId: "team host",
    });
  });

  it("does not match agent detail routes", () => {
    expect(parseHostAgentDraftRouteFromPathname("/h/local/agent/abc123")).toBeNull();
  });
});

describe("parseHostDraftRouteFromPathname", () => {
  it("parses /new draft routes", () => {
    expect(parseHostDraftRouteFromPathname("/h/local/new")).toEqual({
      serverId: "local",
    });
  });
});

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

  it("encodes file paths as base64url (no padding)", () => {
    const encoded = encodeFilePathForPathSegment("src/index.ts");
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFilePathFromPathSegment(encoded)).toBe("src/index.ts");
  });

  it("parses workspace route", () => {
    expect(
      parseHostWorkspaceRouteFromPathname("/h/local/workspace/L3RtcC9yZXBv")
    ).toEqual({
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

  it("parses workspace file route", () => {
    const encodedPath = encodeFilePathForPathSegment("src/index.ts");
    expect(
      parseHostWorkspaceFileRouteFromPathname(
        `/h/local/workspace/L3RtcC9yZXBv/file/${encodedPath}`
      )
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
      filePath: "src/index.ts",
    });
  });

  it("parses workspace agent route", () => {
    expect(
      parseHostWorkspaceAgentRouteFromPathname(
        "/h/local/workspace/L3RtcC9yZXBv/agent/agent-1"
      )
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
      agentId: "agent-1",
    });
  });

  it("parses workspace terminal route", () => {
    expect(
      parseHostWorkspaceTerminalRouteFromPathname(
        "/h/local/workspace/L3RtcC9yZXBv/terminal/term-1"
      )
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
      terminalId: "term-1",
    });
  });

  it("parses workspace tab route", () => {
    expect(
      parseHostWorkspaceTabRouteFromPathname(
        "/h/local/workspace/L3RtcC9yZXBv/tab/draft_abc123"
      )
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
      tabId: "draft_abc123",
    });
  });

  it("still parses legacy percent-encoded workspace routes", () => {
    expect(
      parseHostWorkspaceAgentRouteFromPathname(
        "/h/local/workspace/%2Ftmp%2Frepo/agent/agent-1"
      )
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
      agentId: "agent-1",
    });
  });

  it("builds base64url workspace routes", () => {
    expect(buildHostWorkspaceRoute("local", "/tmp/repo")).toBe(
      "/h/local/workspace/L3RtcC9yZXBv"
    );
  });

  it("builds base64url workspace file routes", () => {
    expect(buildHostWorkspaceFileRoute("local", "/tmp/repo", "src/index.ts")).toBe(
      `/h/local/workspace/L3RtcC9yZXBv/file/${encodeFilePathForPathSegment("src/index.ts")}`
    );
  });
});
