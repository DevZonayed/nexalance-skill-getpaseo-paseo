import { describe, expect, it, vi } from "vitest";
import { ServiceRouteStore } from "./service-proxy.js";
import { createBranchChangeRouteHandler } from "./service-route-branch-handler.js";

function registerRoute(
  routeStore: ServiceRouteStore,
  {
    hostname,
    port,
    workspaceId = "workspace-a",
    serviceName,
  }: {
    hostname: string;
    port: number;
    workspaceId?: string;
    serviceName: string;
  },
): void {
  routeStore.registerRoute({
    hostname,
    port,
    workspaceId,
    serviceName,
  });
}

describe("service-route-branch-handler", () => {
  it("updates routes on branch rename by removing old hostnames and registering new ones", () => {
    const routeStore = new ServiceRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      serviceName: "api",
    });

    const emitServiceStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitServiceStatusUpdate,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(routeStore.findRoute("feature-auth.api.localhost")).toBeNull();
    expect(routeStore.findRoute("feature-billing.api.localhost")).toEqual({
      hostname: "feature-billing.api.localhost",
      port: 3001,
    });
  });

  it("is a no-op when the workspace has no routes", () => {
    const routeStore = new ServiceRouteStore();
    const emitServiceStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitServiceStatusUpdate,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(routeStore.listRoutes()).toEqual([]);
    expect(emitServiceStatusUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op when the resolved hostnames do not change", () => {
    const routeStore = new ServiceRouteStore();
    registerRoute(routeStore, {
      hostname: "api.localhost",
      port: 3001,
      serviceName: "api",
    });

    const emitServiceStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitServiceStatusUpdate,
    });

    handleBranchChange("workspace-a", "main", "master");

    expect(routeStore.listRoutesForWorkspace("workspace-a")).toEqual([
      {
        hostname: "api.localhost",
        port: 3001,
        workspaceId: "workspace-a",
        serviceName: "api",
      },
    ]);
    expect(emitServiceStatusUpdate).not.toHaveBeenCalled();
  });

  it("emits a status update with the refreshed route payload after a route change", () => {
    const routeStore = new ServiceRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      serviceName: "api",
    });

    const emitServiceStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitServiceStatusUpdate,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(emitServiceStatusUpdate).toHaveBeenCalledWith("workspace-a", [
      {
        serviceName: "api",
        hostname: "feature-billing.api.localhost",
        port: 3001,
        url: null,
        status: "stopped",
      },
    ]);
  });

  it("updates all services for a workspace when multiple routes are registered", () => {
    const routeStore = new ServiceRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      serviceName: "api",
    });
    registerRoute(routeStore, {
      hostname: "feature-auth.web.localhost",
      port: 3002,
      serviceName: "web",
    });
    registerRoute(routeStore, {
      hostname: "docs.localhost",
      port: 3003,
      workspaceId: "workspace-b",
      serviceName: "docs",
    });

    const emitServiceStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitServiceStatusUpdate,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(routeStore.listRoutesForWorkspace("workspace-a")).toEqual([
      {
        hostname: "feature-billing.api.localhost",
        port: 3001,
        workspaceId: "workspace-a",
        serviceName: "api",
      },
      {
        hostname: "feature-billing.web.localhost",
        port: 3002,
        workspaceId: "workspace-a",
        serviceName: "web",
      },
    ]);
    expect(routeStore.listRoutesForWorkspace("workspace-b")).toEqual([
      {
        hostname: "docs.localhost",
        port: 3003,
        workspaceId: "workspace-b",
        serviceName: "docs",
      },
    ]);
  });

  it("does not emit a status update when no changes are needed", () => {
    const routeStore = new ServiceRouteStore();
    registerRoute(routeStore, {
      hostname: "web.localhost",
      port: 3002,
      serviceName: "web",
    });

    const emitServiceStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitServiceStatusUpdate,
    });

    handleBranchChange("workspace-a", null, "main");

    expect(emitServiceStatusUpdate).not.toHaveBeenCalled();
  });
});
