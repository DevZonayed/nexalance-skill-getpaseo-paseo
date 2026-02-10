import { describe, expect, it } from "vitest";

import {
  buildNotificationRoute,
  resolveNotificationTarget,
} from "./notification-routing";

describe("resolveNotificationTarget", () => {
  it("extracts non-empty server and agent ids", () => {
    expect(
      resolveNotificationTarget({
        serverId: " server-123 ",
        agentId: " agent-456 ",
      })
    ).toEqual({
      serverId: "server-123",
      agentId: "agent-456",
    });
  });

  it("returns null for missing/empty ids", () => {
    expect(resolveNotificationTarget({ serverId: "", agentId: "   " })).toEqual({
      serverId: null,
      agentId: null,
    });
    expect(resolveNotificationTarget(undefined)).toEqual({
      serverId: null,
      agentId: null,
    });
  });
});

describe("buildNotificationRoute", () => {
  it("routes directly to server-scoped agent path when both ids are present", () => {
    expect(buildNotificationRoute({ serverId: "srv-1", agentId: "agent-1" })).toBe(
      "/agent/srv-1/agent-1"
    );
  });

  it("falls back to legacy agent route when serverId is absent", () => {
    expect(buildNotificationRoute({ agentId: "agent-legacy" })).toBe("/agent/agent-legacy");
  });

  it("falls back to agents list when no agent id is present", () => {
    expect(buildNotificationRoute({ serverId: "srv-only" })).toBe("/agents");
  });

  it("encodes path segments", () => {
    expect(
      buildNotificationRoute({
        serverId: "srv/with/slash",
        agentId: "agent with space",
      })
    ).toBe("/agent/srv%2Fwith%2Fslash/agent%20with%20space");
  });
});
