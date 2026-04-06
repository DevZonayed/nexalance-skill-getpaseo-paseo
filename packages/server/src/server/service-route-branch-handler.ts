import type { Logger } from "pino";
import type { WorkspaceServicePayload } from "../shared/messages.js";
import { buildServiceHostname } from "../utils/service-hostname.js";
import { buildWorkspaceServicePayloads } from "./service-status-projection.js";
import type { ServiceRouteEntry, ServiceRouteStore } from "./service-proxy.js";

interface BranchChangeRouteHandlerOptions {
  routeStore: ServiceRouteStore;
  emitServiceStatusUpdate: (
    workspaceId: string,
    services: WorkspaceServicePayload[],
  ) => void;
  logger?: Logger;
}

interface RouteHostnameUpdate {
  oldHostname: string;
  newHostname: string;
  route: ServiceRouteEntry;
}

export function createBranchChangeRouteHandler(
  options: BranchChangeRouteHandlerOptions,
): (workspaceId: string, oldBranch: string | null, newBranch: string | null) => void {
  return (workspaceId, _oldBranch, newBranch) => {
    const routes = options.routeStore.listRoutesForWorkspace(workspaceId);
    if (routes.length === 0) {
      return;
    }

    const updates: RouteHostnameUpdate[] = [];
    for (const route of routes) {
      const newHostname = buildServiceHostname(newBranch, route.serviceName);
      if (newHostname !== route.hostname) {
        updates.push({
          oldHostname: route.hostname,
          newHostname,
          route,
        });
      }
    }

    if (updates.length === 0) {
      return;
    }

    for (const { oldHostname, newHostname, route } of updates) {
      options.routeStore.removeRoute(oldHostname);
      options.routeStore.registerRoute({
        hostname: newHostname,
        port: route.port,
        workspaceId: route.workspaceId,
        serviceName: route.serviceName,
      });
      options.logger?.info(
        {
          oldHostname,
          newHostname,
          serviceName: route.serviceName,
        },
        "Updated service route for branch rename",
      );
    }

    options.emitServiceStatusUpdate(
      workspaceId,
      buildWorkspaceServicePayloads(options.routeStore, workspaceId, null),
    );
  };
}
