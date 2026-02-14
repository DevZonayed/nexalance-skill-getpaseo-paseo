import { SessionProvider } from "@/contexts/session-context";
import {
  useDaemonRegistry,
  type HostConnection,
  type HostProfile,
} from "@/contexts/daemon-registry-context";
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
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ActiveConnection } from "@/contexts/daemon-connections-context";

type Candidate = {
  connection: HostConnection;
  connectionId: string;
  url: string;
  activeConnection: ActiveConnection;
  daemonPublicKeyB64?: string;
};

function sortConnectionsByPreference<T extends { id: string }>(
  connections: T[],
  preferredId: string | null
): T[] {
  if (!preferredId) return connections;
  const idx = connections.findIndex((c) => c.id === preferredId);
  if (idx === -1) return connections;
  return [connections[idx]!, ...connections.slice(0, idx), ...connections.slice(idx + 1)];
}

function buildCandidates(host: HostProfile): Candidate[] {
  const preferred = host.preferredConnectionId ?? null;
  const connections = sortConnectionsByPreference(host.connections, preferred);

  const out: Candidate[] = [];

  for (const conn of connections) {
    if (conn.type === "direct") {
      out.push({
        connection: conn,
        connectionId: conn.id,
        url: buildDaemonWebSocketUrl(conn.endpoint),
        activeConnection: {
          type: "direct",
          endpoint: conn.endpoint,
          display: conn.endpoint,
        },
      });
      continue;
    }

    out.push({
      connection: conn,
      connectionId: conn.id,
      url: buildRelayWebSocketUrl({
        endpoint: conn.relayEndpoint,
        serverId: host.serverId,
      }),
      activeConnection: { type: "relay", endpoint: conn.relayEndpoint, display: "relay" },
      daemonPublicKeyB64: conn.daemonPublicKeyB64,
    });
  }

  return out;
}

function ManagedDaemonSession({ daemon }: { daemon: HostProfile }) {
  const candidates = useMemo(() => buildCandidates(daemon), [daemon]);
  const latencyQueries = useQueries({
    queries: candidates.map((candidate) => ({
      queryKey: ["connection-selection-latency", daemon.serverId, candidate.connectionId],
      queryFn: () =>
        measureConnectionLatency(candidate.connection, {
          serverId: daemon.serverId,
        }),
      refetchInterval: 10_000,
      staleTime: 9_000,
      gcTime: 60_000,
      retry: 1,
    })),
  });

  const probeByConnectionId = useMemo(() => {
    const next = new Map<string, ConnectionProbeState>();

    candidates.forEach((candidate, index) => {
      const query = latencyQueries[index];
      if (!query) {
        next.set(candidate.connectionId, { status: "pending", latencyMs: null });
        return;
      }

      if (query.isSuccess && typeof query.data === "number") {
        next.set(candidate.connectionId, {
          status: "available",
          latencyMs: query.data,
        });
        return;
      }

      if (query.isError) {
        next.set(candidate.connectionId, { status: "unavailable", latencyMs: null });
        return;
      }

      next.set(candidate.connectionId, { status: "pending", latencyMs: null });
    });

    return next;
  }, [candidates, latencyQueries]);

  const candidateInputs = useMemo<ConnectionCandidate[]>(
    () =>
      candidates.map((candidate) => ({
        connectionId: candidate.connectionId,
        connection: candidate.connection,
      })),
    [candidates]
  );

  const activeConnectionId = useMemo(
    () =>
      selectBestConnection({
        candidates: candidateInputs,
        preferredConnectionId: daemon.preferredConnectionId,
        probeByConnectionId,
      }),
    [candidateInputs, daemon.preferredConnectionId, probeByConnectionId]
  );
  const active =
    candidates.find((candidate) => candidate.connectionId === activeConnectionId) ?? null;
  const activeUrl = active?.url ?? null;

  if (!activeUrl) {
    return null;
  }

  return (
    <SessionProvider
      key={daemon.serverId}
      serverUrl={activeUrl}
      serverId={daemon.serverId}
      activeConnection={active?.activeConnection ?? null}
      daemonPublicKeyB64={active?.daemonPublicKeyB64}
    >
      {null}
    </SessionProvider>
  );
}

export function MultiDaemonSessionHost() {
  const { daemons } = useDaemonRegistry();
  if (daemons.length === 0) {
    return null;
  }

  return (
    <>
      {daemons.map((daemon) => (
        <ManagedDaemonSession key={daemon.serverId} daemon={daemon} />
      ))}
    </>
  );
}
