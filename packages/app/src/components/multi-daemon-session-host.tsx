import { useEffect } from "react";
import { AppState } from "react-native";
import { SessionProvider } from "@/contexts/session-context";
import { useDaemonRegistry, type HostProfile } from "@/contexts/daemon-registry-context";
import { useDaemonConnections } from "@/contexts/daemon-connections-context";
import {
  getHostRuntimeStore,
  useHostRuntimeSession,
} from "@/runtime/host-runtime";
import { toDaemonConnectionUpdateFromRuntime } from "@/runtime/host-runtime-bridge";

function ManagedDaemonSession({ daemon }: { daemon: HostProfile }) {
  const { snapshot, client } = useHostRuntimeSession(daemon.serverId);
  const { connectionStates, updateConnectionStatus } = useDaemonConnections();
  const hasConnectionRecord = connectionStates.has(daemon.serverId);

  useEffect(() => {
    if (!hasConnectionRecord) {
      return;
    }
    updateConnectionStatus(
      daemon.serverId,
      toDaemonConnectionUpdateFromRuntime(snapshot)
    );
  }, [daemon.serverId, hasConnectionRecord, snapshot, updateConnectionStatus]);

  if (!client) {
    return null;
  }

  return (
    <SessionProvider
      key={daemon.serverId}
      serverId={daemon.serverId}
      client={client}
    >
      {null}
    </SessionProvider>
  );
}

export function MultiDaemonSessionHost() {
  const { daemons } = useDaemonRegistry();

  useEffect(() => {
    const runtime = getHostRuntimeStore();
    runtime.syncHosts(daemons);
  }, [daemons]);

  useEffect(() => {
    const runtime = getHostRuntimeStore();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        return;
      }
      runtime.ensureConnectedAll();
      void runtime.runProbeCycleNow();
    });
    return () => {
      subscription.remove();
    };
  }, []);

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
