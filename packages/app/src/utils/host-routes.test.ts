import { describe, expect, it } from "vitest";
import {
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
  it("parses workspace route", () => {
    expect(
      parseHostWorkspaceRouteFromPathname("/h/local/workspace/%2Ftmp%2Frepo")
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
    });
  });

  it("parses workspace agent route", () => {
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

  it("parses workspace terminal route", () => {
    expect(
      parseHostWorkspaceTerminalRouteFromPathname(
        "/h/local/workspace/%2Ftmp%2Frepo/terminal/term-1"
      )
    ).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
      terminalId: "term-1",
    });
  });
});
