import type { ConnectionStateUpdate } from "@/contexts/daemon-connections-context";
import type { HostRuntimeSnapshot } from "./host-runtime";

export function toDaemonConnectionUpdateFromRuntime(
  snapshot: HostRuntimeSnapshot | null
): ConnectionStateUpdate {
  if (!snapshot) {
    return {
      status: "offline",
      activeConnection: null,
      lastError: null,
      lastOnlineAt: null,
    };
  }

  const activeConnection = snapshot.activeConnection;
  switch (snapshot.connectionStatus) {
    case "idle":
      return { status: "idle" };
    case "connecting":
      return {
        status: "connecting",
        activeConnection,
        lastOnlineAt: snapshot.lastOnlineAt,
      };
    case "online":
      return {
        status: "online",
        activeConnection,
        lastOnlineAt: snapshot.lastOnlineAt ?? new Date().toISOString(),
      };
    case "offline":
      return {
        status: "offline",
        activeConnection,
        lastError: null,
        lastOnlineAt: snapshot.lastOnlineAt,
      };
    case "error":
      return {
        status: "error",
        activeConnection,
        lastError: snapshot.lastError ?? "Connection error",
        lastOnlineAt: snapshot.lastOnlineAt,
      };
  }
}
