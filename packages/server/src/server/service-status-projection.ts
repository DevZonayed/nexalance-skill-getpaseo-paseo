import type {
  ServiceStatusUpdateMessage,
  SessionOutboundMessage,
  WorkspaceServicePayload,
} from "../shared/messages.js";
import { buildServiceHostname } from "../utils/service-hostname.js";
import { getServiceConfigs } from "../utils/worktree.js";
import { readGitCommand } from "./workspace-git-metadata.js";
import type { ServiceHealthEntry } from "./service-health-monitor.js";
import type { ServiceRouteEntry, ServiceRouteStore } from "./service-proxy.js";

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

type ConfiguredWorkspaceService = {
  serviceName: string;
  hostname: string;
  port: number | null;
};

function resolveWorkspaceBranchName(workspaceDirectory: string): string | null {
  return readGitCommand(workspaceDirectory, "git symbolic-ref --short HEAD");
}

function listConfiguredWorkspaceServices(workspaceDirectory: string): ConfiguredWorkspaceService[] {
  const branchName = resolveWorkspaceBranchName(workspaceDirectory);
  const serviceConfigs = getServiceConfigs(workspaceDirectory);
  return Array.from(serviceConfigs.entries()).map(([serviceName, config]) => ({
    serviceName,
    hostname: buildServiceHostname(branchName, serviceName),
    port: config.port ?? null,
  }));
}

function mergeWorkspaceServiceDefinitions(
  workspaceDirectory: string,
  routeStore: ServiceRouteStore,
): Array<ConfiguredWorkspaceService | ServiceRouteEntry> {
  const merged = new Map<string, ConfiguredWorkspaceService | ServiceRouteEntry>();

  for (const service of listConfiguredWorkspaceServices(workspaceDirectory)) {
    merged.set(service.hostname, service);
  }

  for (const route of routeStore.listRoutesForWorkspace(workspaceDirectory)) {
    merged.set(route.hostname, route);
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.serviceName.localeCompare(right.serviceName, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

export function buildWorkspaceServicePayloads(
  routeStore: ServiceRouteStore,
  workspaceDirectory: string,
  daemonPort: number | null,
  resolveHealth?: (hostname: string) => "healthy" | "unhealthy" | null,
): WorkspaceServicePayload[] {
  return mergeWorkspaceServiceDefinitions(workspaceDirectory, routeStore).map((service) => {
    const route = routeStore.getRouteEntry(service.hostname);
    return {
      serviceName: service.serviceName,
      hostname: service.hostname,
      port: route?.port ?? service.port,
      url: toServiceUrl(service.hostname, daemonPort),
      lifecycle: route ? "running" : "stopped",
      health: resolveHealth?.(service.hostname) ?? null,
    };
  });
}

function buildServiceStatusUpdateMessage(params: {
  workspaceId: string;
  services: WorkspaceServicePayload[];
}): ServiceStatusUpdateMessage {
  return {
    type: "service_status_update",
    payload: {
      workspaceId: params.workspaceId,
      services: params.services,
    },
  };
}

export function createServiceStatusEmitter({
  sessions,
  routeStore,
  daemonPort,
}: {
  sessions: () => SessionEmitter[];
  routeStore: ServiceRouteStore;
  daemonPort: number | null | (() => number | null);
}): (workspaceId: string, services: ServiceHealthEntry[]) => void {
  return (workspaceId, services) => {
    const resolvedDaemonPort = resolveDaemonPort(daemonPort);
    const serviceHealthByHostname = new Map(
      services.map((service) => [service.hostname, service.health] as const),
    );

    const projected = buildWorkspaceServicePayloads(
      routeStore,
      workspaceId,
      resolvedDaemonPort,
      (hostname) => serviceHealthByHostname.get(hostname) ?? null,
    );

    const message = buildServiceStatusUpdateMessage({
      workspaceId,
      services: projected,
    });

    for (const session of sessions()) {
      session.emit(message);
    }
  };
}
