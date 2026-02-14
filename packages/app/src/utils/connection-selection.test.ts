import { describe, expect, it } from "vitest";
import { type HostConnection } from "@/contexts/daemon-registry-context";
import {
  selectBestConnection,
  type ConnectionCandidate,
  type ConnectionProbeState,
} from "./connection-selection";

function makeDirect(id: string, endpoint: string): HostConnection {
  return { id, type: "direct", endpoint };
}

function makeRelay(
  id: string,
  relayEndpoint: string,
  daemonPublicKeyB64 = "abc"
): HostConnection {
  return { id, type: "relay", relayEndpoint, daemonPublicKeyB64 };
}

function probes(
  input: Record<string, ConnectionProbeState>
): Map<string, ConnectionProbeState> {
  return new Map(Object.entries(input));
}

describe("selectBestConnection", () => {
  it("picks the available connection with lowest latency regardless of transport type", () => {
    const candidates: ConnectionCandidate[] = [
      { connectionId: "direct:a", connection: makeDirect("direct:a", "a:6767") },
      {
        connectionId: "relay:b",
        connection: makeRelay("relay:b", "relay.example:443"),
      },
    ];

    const selected = selectBestConnection({
      candidates,
      preferredConnectionId: "direct:a",
      probeByConnectionId: probes({
        "direct:a": { status: "available", latencyMs: 84 },
        "relay:b": { status: "available", latencyMs: 34 },
      }),
    });

    expect(selected).toBe("relay:b");
  });

  it("ignores unavailable and pending probes", () => {
    const candidates: ConnectionCandidate[] = [
      { connectionId: "direct:a", connection: makeDirect("direct:a", "a:6767") },
      {
        connectionId: "relay:b",
        connection: makeRelay("relay:b", "relay.example:443"),
      },
      { connectionId: "direct:c", connection: makeDirect("direct:c", "c:6767") },
    ];

    const selected = selectBestConnection({
      candidates,
      preferredConnectionId: "direct:a",
      probeByConnectionId: probes({
        "direct:a": { status: "pending", latencyMs: null },
        "relay:b": { status: "unavailable", latencyMs: null },
        "direct:c": { status: "available", latencyMs: 41 },
      }),
    });

    expect(selected).toBe("direct:c");
  });

  it("falls back to preferred connection when no candidates are available", () => {
    const candidates: ConnectionCandidate[] = [
      { connectionId: "direct:a", connection: makeDirect("direct:a", "a:6767") },
      {
        connectionId: "relay:b",
        connection: makeRelay("relay:b", "relay.example:443"),
      },
    ];

    const selected = selectBestConnection({
      candidates,
      preferredConnectionId: "relay:b",
      probeByConnectionId: probes({
        "direct:a": { status: "pending", latencyMs: null },
        "relay:b": { status: "unavailable", latencyMs: null },
      }),
    });

    expect(selected).toBe("relay:b");
  });

  it("falls back to first candidate when preferred is missing and none are available", () => {
    const candidates: ConnectionCandidate[] = [
      { connectionId: "direct:a", connection: makeDirect("direct:a", "a:6767") },
      {
        connectionId: "relay:b",
        connection: makeRelay("relay:b", "relay.example:443"),
      },
    ];

    const selected = selectBestConnection({
      candidates,
      preferredConnectionId: "missing",
      probeByConnectionId: probes({
        "direct:a": { status: "unavailable", latencyMs: null },
        "relay:b": { status: "pending", latencyMs: null },
      }),
    });

    expect(selected).toBe("direct:a");
  });
});
