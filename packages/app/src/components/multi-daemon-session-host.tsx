import { SessionProvider } from "@/contexts/session-context";
import {
  useDaemonRegistry,
  type HostProfile,
} from "@/contexts/daemon-registry-context";
import {
  buildDaemonWebSocketUrl,
  buildRelayWebSocketUrl,
} from "@/utils/daemon-endpoints";
import { useMemo } from "react";
import type { ActiveConnection } from "@/contexts/daemon-connections-context";

type Candidate = {
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

  const direct = sortConnectionsByPreference(
    host.connections.filter((c) => c.type === "direct"),
    preferred
  );
  const relay = sortConnectionsByPreference(
    host.connections.filter((c) => c.type === "relay"),
    preferred
  );

  const out: Candidate[] = [];

  for (const conn of direct) {
    out.push({
      connectionId: conn.id,
      url: buildDaemonWebSocketUrl(conn.endpoint),
      activeConnection: { type: "direct", endpoint: conn.endpoint, display: conn.endpoint },
    });
  }

  for (const conn of relay) {
    out.push({
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
  const active =
    candidates.find((candidate) => candidate.connectionId === daemon.preferredConnectionId) ??
    candidates[0] ??
    null;
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
