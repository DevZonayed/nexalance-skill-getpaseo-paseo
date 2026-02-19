import { describe, expect, it } from "vitest";
import type { DaemonClient, ConnectionState } from "@server/client/daemon-client";
import type { HostConnection, HostProfile } from "@/contexts/daemon-registry-context";
import {
  HostRuntimeController,
  type HostRuntimeControllerDeps,
} from "./host-runtime";

class FakeDaemonClient {
  private state: ConnectionState = { status: "idle" };
  private listeners = new Set<(status: ConnectionState) => void>();
  private error: string | null = null;
  public connectCalls = 0;
  public closeCalls = 0;
  public ensureConnectedCalls = 0;

  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.setConnectionState({ status: "connected" });
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.setConnectionState({ status: "disconnected", reason: "client_closed" });
  }

  ensureConnected(): void {
    this.ensureConnectedCalls += 1;
    if (this.state.status !== "connected") {
      this.setConnectionState({ status: "connected" });
    }
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  subscribeConnectionStatus(
    listener: (status: ConnectionState) => void
  ): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get lastError(): string | null {
    return this.error;
  }

  setConnectionState(next: ConnectionState): void {
    this.state = next;
    if (next.status === "disconnected") {
      this.error = next.reason ?? this.error;
    }
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}

function makeHost(input?: Partial<HostProfile>): HostProfile {
  const direct: HostConnection = {
    id: "direct:lan:6767",
    type: "direct",
    endpoint: "lan:6767",
  };
  const relay: HostConnection = {
    id: "relay:relay.paseo.sh:443",
    type: "relay",
    relayEndpoint: "relay.paseo.sh:443",
    daemonPublicKeyB64: "pk_test",
  };

  return {
    serverId: input?.serverId ?? "srv_test",
    label: input?.label ?? "test host",
    connections: input?.connections ?? [direct, relay],
    preferredConnectionId: input?.preferredConnectionId ?? direct.id,
    createdAt: input?.createdAt ?? new Date(0).toISOString(),
    updatedAt: input?.updatedAt ?? new Date(0).toISOString(),
  };
}

function makeDeps(
  latencyByConnectionId: Record<string, number | Error>,
  createdClients: FakeDaemonClient[]
): HostRuntimeControllerDeps {
  return {
    createClient: () => {
      const client = new FakeDaemonClient();
      createdClients.push(client);
      return client as unknown as DaemonClient;
    },
    measureLatency: async ({ connection }) => {
      const value = latencyByConnectionId[connection.id];
      if (value instanceof Error) {
        throw value;
      }
      if (typeof value !== "number") {
        throw new Error(`missing latency for ${connection.id}`);
      }
      return value;
    },
  };
}

describe("HostRuntimeController", () => {
  it("selects the lowest-latency connection on startup", async () => {
    const host = makeHost({ preferredConnectionId: "direct:lan:6767" });
    const clients: FakeDaemonClient[] = [];
    const latencies: Record<string, number | Error> = {
      "direct:lan:6767": 82,
      "relay:relay.paseo.sh:443": 18,
    };
    const controller = new HostRuntimeController({
      host,
      deps: makeDeps(latencies, clients),
    });

    await controller.start({ autoProbe: false });

    const snapshot = controller.getSnapshot();
    expect(snapshot.activeConnectionId).toBe("relay:relay.paseo.sh:443");
    expect(snapshot.connectionStatus).toBe("online");
    expect(clients).toHaveLength(1);
    expect(clients[0]?.connectCalls).toBe(1);
  });

  it("fails over when active connection becomes unavailable", async () => {
    const host = makeHost({ preferredConnectionId: "direct:lan:6767" });
    const clients: FakeDaemonClient[] = [];
    const latencies: Record<string, number | Error> = {
      "direct:lan:6767": 15,
      "relay:relay.paseo.sh:443": 55,
    };
    const controller = new HostRuntimeController({
      host,
      deps: makeDeps(latencies, clients),
    });

    await controller.start({ autoProbe: false });
    expect(controller.getSnapshot().activeConnectionId).toBe("direct:lan:6767");
    expect(clients).toHaveLength(1);

    latencies["direct:lan:6767"] = new Error("direct unavailable");
    latencies["relay:relay.paseo.sh:443"] = 42;
    await controller.runProbeCycleNow();

    const snapshot = controller.getSnapshot();
    expect(snapshot.activeConnectionId).toBe("relay:relay.paseo.sh:443");
    expect(snapshot.connectionStatus).toBe("online");
    expect(clients).toHaveLength(2);
    expect(clients[0]?.closeCalls).toBe(1);
  });

  it("switches only after the faster alternative wins consecutive probes", async () => {
    const host = makeHost({ preferredConnectionId: "direct:lan:6767" });
    const clients: FakeDaemonClient[] = [];
    const latencies: Record<string, number | Error> = {
      "direct:lan:6767": 15,
      "relay:relay.paseo.sh:443": 60,
    };
    const controller = new HostRuntimeController({
      host,
      deps: makeDeps(latencies, clients),
    });

    await controller.start({ autoProbe: false });
    expect(controller.getSnapshot().activeConnectionId).toBe("direct:lan:6767");

    latencies["direct:lan:6767"] = 95;
    latencies["relay:relay.paseo.sh:443"] = 30;
    await controller.runProbeCycleNow();
    expect(controller.getSnapshot().activeConnectionId).toBe("direct:lan:6767");

    await controller.runProbeCycleNow();
    expect(controller.getSnapshot().activeConnectionId).toBe("direct:lan:6767");

    await controller.runProbeCycleNow();
    expect(controller.getSnapshot().activeConnectionId).toBe("relay:relay.paseo.sh:443");
    expect(clients).toHaveLength(2);
  });

  it("does not switch on a transient latency spike", async () => {
    const host = makeHost({ preferredConnectionId: "direct:lan:6767" });
    const clients: FakeDaemonClient[] = [];
    const latencies: Record<string, number | Error> = {
      "direct:lan:6767": 15,
      "relay:relay.paseo.sh:443": 80,
    };
    const controller = new HostRuntimeController({
      host,
      deps: makeDeps(latencies, clients),
    });

    await controller.start({ autoProbe: false });
    expect(controller.getSnapshot().activeConnectionId).toBe("direct:lan:6767");

    latencies["direct:lan:6767"] = 100;
    latencies["relay:relay.paseo.sh:443"] = 20;
    await controller.runProbeCycleNow();
    expect(controller.getSnapshot().activeConnectionId).toBe("direct:lan:6767");

    latencies["direct:lan:6767"] = 20;
    latencies["relay:relay.paseo.sh:443"] = 90;
    await controller.runProbeCycleNow();
    expect(controller.getSnapshot().activeConnectionId).toBe("direct:lan:6767");

    latencies["direct:lan:6767"] = 100;
    latencies["relay:relay.paseo.sh:443"] = 20;
    await controller.runProbeCycleNow();
    expect(controller.getSnapshot().activeConnectionId).toBe("direct:lan:6767");

    await controller.runProbeCycleNow();
    expect(controller.getSnapshot().activeConnectionId).toBe("direct:lan:6767");

    await controller.runProbeCycleNow();
    expect(controller.getSnapshot().activeConnectionId).toBe("relay:relay.paseo.sh:443");
  });

  it("exposes one snapshot with active connection and status from same source", async () => {
    const host = makeHost();
    const clients: FakeDaemonClient[] = [];
    const latencies: Record<string, number | Error> = {
      "direct:lan:6767": 12,
      "relay:relay.paseo.sh:443": 65,
    };
    const controller = new HostRuntimeController({
      host,
      deps: makeDeps(latencies, clients),
    });

    const observed = new Array<ReturnType<typeof controller.getSnapshot>>();
    const unsubscribe = controller.subscribe(() => {
      observed.push(controller.getSnapshot());
    });

    await controller.start({ autoProbe: false });

    clients[0]?.setConnectionState({
      status: "disconnected",
      reason: "transport closed",
    });

    const latest = observed[observed.length - 1];
    expect(latest?.activeConnectionId).toBe("direct:lan:6767");
    expect(latest?.connectionStatus).toBe("error");
    expect(latest?.lastError).toBe("transport closed");
    unsubscribe();
  });
});
