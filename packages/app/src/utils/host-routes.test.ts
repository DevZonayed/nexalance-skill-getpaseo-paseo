import { describe, expect, it } from "vitest";
import {
  buildHostWorkspaceRoute,
  decodeWorkspaceIdFromPathSegment,
  encodeWorkspaceIdForPathSegment,
  parseHostAgentDraftRouteFromPathname,
  parseHostAgentRouteFromPathname,
  parseHostDraftRouteFromPathname,
  parseHostWorkspaceAgentRouteFromPathname,
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

  it("parses workspace route", () => {
    expect(
      parseHostWorkspaceRouteFromPathname("/h/local/workspace/L3RtcC9yZXBv")
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
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
});
