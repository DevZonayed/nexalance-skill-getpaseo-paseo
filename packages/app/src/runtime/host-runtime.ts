import { useMemo, useSyncExternalStore } from "react";
import { DaemonClient, type ConnectionState } from "@server/client/daemon-client";
import type { HostConnection, HostProfile } from "@/contexts/daemon-registry-context";
import type { ActiveConnection } from "@/contexts/daemon-connections-context";
import {
  buildDaemonWebSocketUrl,
  buildRelayWebSocketUrl,
} from "@/utils/daemon-endpoints";
import { measureConnectionLatency } from "@/utils/test-daemon-connection";
import {
  selectBestConnection,
  type ConnectionCandidate,
  type ConnectionProbeState,
} from "@/utils/connection-selection";
import { createTauriWebSocketTransportFactory } from "@/utils/tauri-daemon-transport";

export type HostRuntimeConnectionStatus =
  | "idle"
  | "connecting"
  | "online"
  | "offline"
  | "error";

export type HostRuntimeSnapshot = {
  serverId: string;
  activeConnectionId: string | null;
  activeConnection: ActiveConnection | null;
  connectionStatus: HostRuntimeConnectionStatus;
  lastError: string | null;
  lastOnlineAt: string | null;
  probeByConnectionId: Map<string, ConnectionProbeState>;
  clientGeneration: number;
};

export type HostRuntimeControllerDeps = {
  createClient: (input: {
    host: HostProfile;
    connection: HostConnection;
  }) => DaemonClient;
  measureLatency: (input: {
    host: HostProfile;
    connection: HostConnection;
  }) => Promise<number>;
};

export type HostRuntimeStartOptions = {
  autoProbe?: boolean;
};

const PROBE_INTERVAL_MS = 10_000;
const ADAPTIVE_SWITCH_THRESHOLD_MS = 40;
const ADAPTIVE_SWITCH_CONSECUTIVE_PROBES = 3;

function toActiveConnection(connection: HostConnection): ActiveConnection {
  if (connection.type === "direct") {
    return {
      type: "direct",
      endpoint: connection.endpoint,
      display: connection.endpoint,
    };
  }
  return {
    type: "relay",
    endpoint: connection.relayEndpoint,
    display: "relay",
  };
}

function mapClientConnectionState(input: {
  state: ConnectionState;
  lastError: string | null;
}): Pick<HostRuntimeSnapshot, "connectionStatus" | "lastError" | "lastOnlineAt"> {
  const { state, lastError } = input;
  if (state.status === "connected") {
    return {
      connectionStatus: "online",
      lastError: null,
      lastOnlineAt: new Date().toISOString(),
    };
  }
  if (state.status === "connecting") {
    return {
      connectionStatus: "connecting",
      lastError: null,
      lastOnlineAt: null,
    };
  }
  if (state.status === "idle") {
    return {
      connectionStatus: "idle",
      lastError: null,
      lastOnlineAt: null,
    };
  }

  const reason = state.reason ?? lastError ?? null;
  if (!reason || reason === "client_closed") {
    return {
      connectionStatus: "offline",
      lastError: null,
      lastOnlineAt: null,
    };
  }
  return {
    connectionStatus: "error",
    lastError: reason,
    lastOnlineAt: null,
  };
}

function buildConnectionCandidates(host: HostProfile): ConnectionCandidate[] {
  return host.connections.map((connection) => ({
    connectionId: connection.id,
    connection,
  }));
}

function findConnectionById(
  host: HostProfile,
  connectionId: string | null
): HostConnection | null {
  if (!connectionId) {
    return null;
  }
  return host.connections.find((connection) => connection.id === connectionId) ?? null;
}

function selectInitialConnectionId(host: HostProfile): string | null {
  if (host.connections.length === 0) {
    return null;
  }
  return host.connections[0]?.id ?? null;
}

function createDefaultDeps(): HostRuntimeControllerDeps {
  return {
    createClient: ({ host, connection }) => {
      const tauriTransportFactory = createTauriWebSocketTransportFactory();
      const base = {
        suppressSendErrors: true,
        ...(tauriTransportFactory
          ? { transportFactory: tauriTransportFactory }
          : {}),
      };
      if (connection.type === "direct") {
        return new DaemonClient({
          ...base,
          url: buildDaemonWebSocketUrl(connection.endpoint),
        });
      }
      return new DaemonClient({
        ...base,
        url: buildRelayWebSocketUrl({
          endpoint: connection.relayEndpoint,
          serverId: host.serverId,
        }),
        e2ee: {
          enabled: true,
          daemonPublicKeyB64: connection.daemonPublicKeyB64,
        },
      });
    },
    measureLatency: ({ host, connection }) =>
      measureConnectionLatency(connection, { serverId: host.serverId }),
  };
}

export class HostRuntimeController {
  private host: HostProfile;
  private deps: HostRuntimeControllerDeps;
  private snapshot: HostRuntimeSnapshot;
  private listeners = new Set<() => void>();
  private activeClient: DaemonClient | null = null;
  private unsubscribeClientStatus: (() => void) | null = null;
  private probeIntervalHandle: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private switchCandidateConnectionId: string | null = null;
  private switchCandidateHitCount = 0;

  constructor(input: {
    host: HostProfile;
    deps?: HostRuntimeControllerDeps;
  }) {
    this.host = input.host;
    this.deps = input.deps ?? createDefaultDeps();
    this.snapshot = {
      serverId: this.host.serverId,
      activeConnectionId: null,
      activeConnection: null,
      connectionStatus: "idle",
      lastError: null,
      lastOnlineAt: null,
      probeByConnectionId: new Map(),
      clientGeneration: 0,
    };
  }

  getSnapshot(): HostRuntimeSnapshot {
    return this.snapshot;
  }

  getClient(): DaemonClient | null {
    return this.activeClient;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(options?: HostRuntimeStartOptions): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    await this.runProbeCycleNow();

    if (!this.snapshot.activeConnectionId) {
      const fallbackConnectionId = selectInitialConnectionId(this.host);
      if (fallbackConnectionId) {
        await this.switchToConnection(fallbackConnectionId);
      }
    }

    if (options?.autoProbe !== false && PROBE_INTERVAL_MS > 0) {
      this.probeIntervalHandle = setInterval(() => {
        void this.runProbeCycleNow();
      }, PROBE_INTERVAL_MS);
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.probeIntervalHandle) {
      clearInterval(this.probeIntervalHandle);
      this.probeIntervalHandle = null;
    }
    if (this.unsubscribeClientStatus) {
      this.unsubscribeClientStatus();
      this.unsubscribeClientStatus = null;
    }
    if (this.activeClient) {
      const prev = this.activeClient;
      this.activeClient = null;
      await prev.close().catch(() => undefined);
    }
    this.updateSnapshot({
      activeConnectionId: null,
      activeConnection: null,
      connectionStatus: "offline",
      lastError: null,
      lastOnlineAt: null,
    });
  }

  async updateHost(host: HostProfile): Promise<void> {
    this.host = host;
    const activeConnectionId = this.snapshot.activeConnectionId;
    const activeConnection = findConnectionById(host, activeConnectionId);
    if (!activeConnection) {
      await this.runProbeCycleNow();
      if (this.snapshot.activeConnectionId) {
        return;
      }
      const fallbackConnectionId = selectInitialConnectionId(host);
      if (!fallbackConnectionId) {
        await this.stop();
        return;
      }
      await this.switchToConnection(fallbackConnectionId);
    }
  }

  ensureConnected(): void {
    this.activeClient?.ensureConnected();
  }

  async runProbeCycleNow(): Promise<void> {
    if (this.host.connections.length === 0) {
      this.updateSnapshot({
        probeByConnectionId: new Map(),
      });
      return;
    }

    const probeByConnectionId = new Map<string, ConnectionProbeState>();
    await Promise.all(
      this.host.connections.map(async (connection) => {
        try {
          const latencyMs = await this.deps.measureLatency({
            host: this.host,
            connection,
          });
          probeByConnectionId.set(connection.id, {
            status: "available",
            latencyMs,
          });
        } catch {
          probeByConnectionId.set(connection.id, {
            status: "unavailable",
            latencyMs: null,
          });
        }
      })
    );

    this.updateSnapshot({ probeByConnectionId });

    const activeConnectionId = this.snapshot.activeConnectionId;
    const activeProbe = activeConnectionId
      ? probeByConnectionId.get(activeConnectionId)
      : null;

    if (!activeConnectionId || !findConnectionById(this.host, activeConnectionId)) {
      const nextConnectionId = selectBestConnection({
        candidates: buildConnectionCandidates(this.host),
        probeByConnectionId,
      });
      if (nextConnectionId) {
        await this.switchToConnection(nextConnectionId);
      }
      return;
    }

    if (activeProbe?.status === "unavailable") {
      const nextConnectionId = selectBestConnection({
        candidates: buildConnectionCandidates(this.host),
        probeByConnectionId,
      });
      if (nextConnectionId && nextConnectionId !== activeConnectionId) {
        await this.switchToConnection(nextConnectionId);
      }
      this.switchCandidateConnectionId = null;
      this.switchCandidateHitCount = 0;
      return;
    }

    if (activeProbe && activeProbe.status === "available") {
      const available = Array.from(probeByConnectionId.entries())
        .filter(([, probe]) => probe.status === "available")
        .map(([connectionId, probe]) => ({
          connectionId,
          latencyMs: (probe as { status: "available"; latencyMs: number }).latencyMs,
        }))
        .sort((left, right) => left.latencyMs - right.latencyMs);

      const fastest = available[0] ?? null;
      if (!fastest || fastest.connectionId === activeConnectionId) {
        this.switchCandidateConnectionId = null;
        this.switchCandidateHitCount = 0;
        return;
      }

      const activeLatency = activeProbe.latencyMs;
      const improvement = activeLatency - fastest.latencyMs;
      if (improvement < ADAPTIVE_SWITCH_THRESHOLD_MS) {
        this.switchCandidateConnectionId = null;
        this.switchCandidateHitCount = 0;
        return;
      }

      if (this.switchCandidateConnectionId === fastest.connectionId) {
        this.switchCandidateHitCount += 1;
      } else {
        this.switchCandidateConnectionId = fastest.connectionId;
        this.switchCandidateHitCount = 1;
      }

      if (
        this.switchCandidateHitCount >=
        ADAPTIVE_SWITCH_CONSECUTIVE_PROBES
      ) {
        this.switchCandidateConnectionId = null;
        this.switchCandidateHitCount = 0;
        await this.switchToConnection(fastest.connectionId);
      }
    }
  }

  private updateSnapshot(
    patch: Partial<Omit<HostRuntimeSnapshot, "serverId" | "clientGeneration">>
  ): void {
    const next: HostRuntimeSnapshot = {
      ...this.snapshot,
      ...patch,
      serverId: this.host.serverId,
    };
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async switchToConnection(connectionId: string): Promise<void> {
    const connection = findConnectionById(this.host, connectionId);
    if (!connection) {
      return;
    }

    if (this.unsubscribeClientStatus) {
      this.unsubscribeClientStatus();
      this.unsubscribeClientStatus = null;
    }
    if (this.activeClient) {
      const previousClient = this.activeClient;
      this.activeClient = null;
      await previousClient.close().catch(() => undefined);
    }

    const client = this.deps.createClient({
      host: this.host,
      connection,
    });
    this.activeClient = client;
    this.snapshot = {
      ...this.snapshot,
      serverId: this.host.serverId,
      activeConnectionId: connection.id,
      activeConnection: toActiveConnection(connection),
      connectionStatus: "connecting",
      lastError: null,
      lastOnlineAt: null,
      clientGeneration: this.snapshot.clientGeneration + 1,
    };
    for (const listener of this.listeners) {
      listener();
    }

    this.unsubscribeClientStatus = client.subscribeConnectionStatus((state) => {
      const mapped = mapClientConnectionState({
        state,
        lastError: client.lastError,
      });
      this.updateSnapshot(mapped);
    });

    try {
      await client.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateSnapshot({
        connectionStatus: "error",
        lastError: message,
      });
    }
  }
}

export class HostRuntimeStore {
  private controllers = new Map<string, HostRuntimeController>();
  private serverListeners = new Map<string, Set<() => void>>();
  private deps: HostRuntimeControllerDeps;

  constructor(input?: {
    deps?: HostRuntimeControllerDeps;
  }) {
    this.deps = input?.deps ?? createDefaultDeps();
  }

  syncHosts(hosts: HostProfile[]): void {
    const nextIds = new Set(hosts.map((host) => host.serverId));
    for (const [serverId, controller] of this.controllers) {
      if (nextIds.has(serverId)) {
        continue;
      }
      this.controllers.delete(serverId);
      void controller.stop();
      this.emit(serverId);
    }

    for (const host of hosts) {
      const existing = this.controllers.get(host.serverId);
      if (existing) {
        void existing.updateHost(host);
        continue;
      }
      const controller = new HostRuntimeController({
        host,
        deps: this.deps,
      });
      this.controllers.set(host.serverId, controller);
      controller.subscribe(() => {
        this.emit(host.serverId);
      });
      void controller.start();
      this.emit(host.serverId);
    }
  }

  getSnapshot(serverId: string): HostRuntimeSnapshot | null {
    return this.controllers.get(serverId)?.getSnapshot() ?? null;
  }

  getClient(serverId: string): DaemonClient | null {
    return this.controllers.get(serverId)?.getClient() ?? null;
  }

  subscribe(serverId: string, listener: () => void): () => void {
    const existing = this.serverListeners.get(serverId) ?? new Set<() => void>();
    existing.add(listener);
    this.serverListeners.set(serverId, existing);
    return () => {
      const set = this.serverListeners.get(serverId);
      if (!set) {
        return;
      }
      set.delete(listener);
      if (set.size === 0) {
        this.serverListeners.delete(serverId);
      }
    };
  }

  ensureConnectedAll(): void {
    for (const controller of this.controllers.values()) {
      controller.ensureConnected();
    }
  }

  runProbeCycleNow(serverId?: string): Promise<void> {
    if (serverId) {
      return this.controllers.get(serverId)?.runProbeCycleNow() ?? Promise.resolve();
    }
    return Promise.all(
      Array.from(this.controllers.values(), (controller) =>
        controller.runProbeCycleNow()
      )
    ).then(() => undefined);
  }

  private emit(serverId: string): void {
    const listeners = this.serverListeners.get(serverId);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener();
    }
  }
}

let singletonHostRuntimeStore: HostRuntimeStore | null = null;

export function getHostRuntimeStore(): HostRuntimeStore {
  if (!singletonHostRuntimeStore) {
    singletonHostRuntimeStore = new HostRuntimeStore();
  }
  return singletonHostRuntimeStore;
}

export function useHostRuntimeSnapshot(
  serverId: string
): HostRuntimeSnapshot | null {
  const store = getHostRuntimeStore();
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(serverId, onStoreChange),
    () => store.getSnapshot(serverId),
    () => store.getSnapshot(serverId)
  );
}

export function useHostRuntimeSession(serverId: string): {
  snapshot: HostRuntimeSnapshot | null;
  client: DaemonClient | null;
} {
  const store = getHostRuntimeStore();
  const snapshot = useHostRuntimeSnapshot(serverId);
  return useMemo(
    () => ({
      snapshot,
      client: store.getClient(serverId),
    }),
    [serverId, snapshot, store]
  );
}
