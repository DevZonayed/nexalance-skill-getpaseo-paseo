import { describe, expect, it } from "vitest";
import type { HostRuntimeSnapshot } from "./host-runtime";
import { toDaemonConnectionUpdateFromRuntime } from "./host-runtime-bridge";

const DIRECT_CONNECTION = {
  type: "direct" as const,
  endpoint: "lan:6767",
  display: "lan:6767",
};

function makeSnapshot(
  input: Partial<HostRuntimeSnapshot>
): HostRuntimeSnapshot {
  return {
    serverId: "srv_test",
    activeConnectionId: "direct:lan:6767",
    activeConnection: DIRECT_CONNECTION,
    connectionStatus: "idle",
    lastError: null,
    lastOnlineAt: null,
    probeByConnectionId: new Map(),
    clientGeneration: 0,
    ...input,
  };
}

describe("toDaemonConnectionUpdateFromRuntime", () => {
  it("maps online snapshots to online updates with the same active connection", () => {
    const snapshot = makeSnapshot({
      connectionStatus: "online",
      lastOnlineAt: "2026-02-19T20:00:00.000Z",
    });

    const update = toDaemonConnectionUpdateFromRuntime(snapshot);

    expect(update).toEqual({
      status: "online",
      activeConnection: DIRECT_CONNECTION,
      lastOnlineAt: "2026-02-19T20:00:00.000Z",
    });
  });

  it("maps error snapshots to error updates with the same error message", () => {
    const snapshot = makeSnapshot({
      connectionStatus: "error",
      lastError: "transport closed",
      lastOnlineAt: "2026-02-19T20:00:00.000Z",
    });

    const update = toDaemonConnectionUpdateFromRuntime(snapshot);

    expect(update).toEqual({
      status: "error",
      activeConnection: DIRECT_CONNECTION,
      lastError: "transport closed",
      lastOnlineAt: "2026-02-19T20:00:00.000Z",
    });
  });

  it("maps missing runtime snapshots to offline updates", () => {
    const update = toDaemonConnectionUpdateFromRuntime(null);

    expect(update).toEqual({
      status: "offline",
      activeConnection: null,
      lastError: null,
      lastOnlineAt: null,
    });
  });
});
