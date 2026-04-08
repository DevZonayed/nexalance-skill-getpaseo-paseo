import type {
  ScriptStatusUpdateMessage,
  SessionOutboundMessage,
  WorkspaceScriptPayload,
} from "../shared/messages.js";
import { buildScriptHostname } from "../utils/script-hostname.js";
import { getScriptConfigs } from "../utils/worktree.js";
import { readGitCommand } from "./workspace-git-metadata.js";
import type { ScriptHealthEntry } from "./script-health-monitor.js";
import type { ScriptRouteEntry, ScriptRouteStore } from "./script-proxy.js";

type SessionEmitter = {
  emit(message: SessionOutboundMessage): void;
};

function resolveDaemonPort(daemonPort: number | null | (() => number | null)): number | null {
  if (typeof daemonPort === "function") {
    return daemonPort();
  }
  return daemonPort;
}

function toServiceUrl(hostname: string, daemonPort: number | null): string | null {
  if (daemonPort === null) {
    return null;
  }
  return `http://${hostname}:${daemonPort}`;
}

type ConfiguredWorkspaceScript = {
  scriptName: string;
  hostname: string;
  port: number | null;
};

function resolveWorkspaceBranchName(workspaceDirectory: string): string | null {
  return readGitCommand(workspaceDirectory, "git symbolic-ref --short HEAD");
}

function listConfiguredWorkspaceScripts(workspaceDirectory: string): ConfiguredWorkspaceScript[] {
  const branchName = resolveWorkspaceBranchName(workspaceDirectory);
  const scriptConfigs = getScriptConfigs(workspaceDirectory);
  return Array.from(scriptConfigs.entries()).map(([scriptName, config]) => ({
    scriptName,
    hostname: buildScriptHostname(branchName, scriptName),
    port: config.port ?? null,
  }));
}

function mergeWorkspaceScriptDefinitions(
  workspaceDirectory: string,
  routeStore: ScriptRouteStore,
): Array<ConfiguredWorkspaceScript | ScriptRouteEntry> {
  const merged = new Map<string, ConfiguredWorkspaceScript | ScriptRouteEntry>();

  for (const script of listConfiguredWorkspaceScripts(workspaceDirectory)) {
    merged.set(script.hostname, script);
  }

  for (const route of routeStore.listRoutesForWorkspace(workspaceDirectory)) {
    merged.set(route.hostname, route);
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.scriptName.localeCompare(right.scriptName, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

export function buildWorkspaceScriptPayloads(
  routeStore: ScriptRouteStore,
  workspaceDirectory: string,
  daemonPort: number | null,
  resolveHealth?: (hostname: string) => "healthy" | "unhealthy" | null,
): WorkspaceScriptPayload[] {
  return mergeWorkspaceScriptDefinitions(workspaceDirectory, routeStore).map((script) => {
    const route = routeStore.getRouteEntry(script.hostname);
    return {
      scriptName: script.scriptName,
      hostname: script.hostname,
      port: route?.port ?? script.port,
      url: toServiceUrl(script.hostname, daemonPort),
      lifecycle: route ? "running" : "stopped",
      health: resolveHealth?.(script.hostname) ?? null,
    };
  });
}

function buildScriptStatusUpdateMessage(params: {
  workspaceId: string;
  scripts: WorkspaceScriptPayload[];
}): ScriptStatusUpdateMessage {
  return {
    type: "script_status_update",
    payload: {
      workspaceId: params.workspaceId,
      scripts: params.scripts,
    },
  };
}

export function createScriptStatusEmitter({
  sessions,
  routeStore,
  daemonPort,
}: {
  sessions: () => SessionEmitter[];
  routeStore: ScriptRouteStore;
  daemonPort: number | null | (() => number | null);
}): (workspaceId: string, scripts: ScriptHealthEntry[]) => void {
  return (workspaceId, scripts) => {
    const resolvedDaemonPort = resolveDaemonPort(daemonPort);
    const scriptHealthByHostname = new Map(
      scripts.map((script) => [script.hostname, script.health] as const),
    );

    const projected = buildWorkspaceScriptPayloads(
      routeStore,
      workspaceId,
      resolvedDaemonPort,
      (hostname) => scriptHealthByHostname.get(hostname) ?? null,
    );

    const message = buildScriptStatusUpdateMessage({
      workspaceId,
      scripts: projected,
    });

    for (const session of sessions()) {
      session.emit(message);
    }
  };
}
