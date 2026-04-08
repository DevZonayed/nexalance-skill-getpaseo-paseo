import { describe, expect, it, vi } from "vitest";
import { ScriptRouteStore } from "./script-proxy.js";
import { createBranchChangeRouteHandler } from "./script-route-branch-handler.js";

function registerRoute(
  routeStore: ScriptRouteStore,
  {
    hostname,
    port,
    workspaceId = "workspace-a",
    scriptName,
  }: {
    hostname: string;
    port: number;
    workspaceId?: string;
    scriptName: string;
  },
): void {
  routeStore.registerRoute({
    hostname,
    port,
    workspaceId,
    scriptName,
  });
}

describe("script-route-branch-handler", () => {
  it("updates routes on branch rename by removing old hostnames and registering new ones", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      scriptName: "api",
    });

    const emitScriptStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitScriptStatusUpdate,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(routeStore.findRoute("feature-auth.api.localhost")).toBeNull();
    expect(routeStore.findRoute("feature-billing.api.localhost")).toEqual({
      hostname: "feature-billing.api.localhost",
      port: 3001,
    });
  });

  it("is a no-op when the workspace has no routes", () => {
    const routeStore = new ScriptRouteStore();
    const emitScriptStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitScriptStatusUpdate,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(routeStore.listRoutes()).toEqual([]);
    expect(emitScriptStatusUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op when the resolved hostnames do not change", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "api.localhost",
      port: 3001,
      scriptName: "api",
    });

    const emitScriptStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitScriptStatusUpdate,
    });

    handleBranchChange("workspace-a", "main", "master");

    expect(routeStore.listRoutesForWorkspace("workspace-a")).toEqual([
      {
        hostname: "api.localhost",
        port: 3001,
        workspaceId: "workspace-a",
        scriptName: "api",
      },
    ]);
    expect(emitScriptStatusUpdate).not.toHaveBeenCalled();
  });

  it("emits a status update with the refreshed route payload after a route change", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      scriptName: "api",
    });

    const emitScriptStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitScriptStatusUpdate,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(emitScriptStatusUpdate).toHaveBeenCalledWith("workspace-a", [
      {
        scriptName: "api",
        hostname: "feature-billing.api.localhost",
        port: 3001,
        url: null,
        lifecycle: "running",
        health: null,
      },
    ]);
  });

  it("updates all services for a workspace when multiple routes are registered", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "feature-auth.api.localhost",
      port: 3001,
      scriptName: "api",
    });
    registerRoute(routeStore, {
      hostname: "feature-auth.web.localhost",
      port: 3002,
      scriptName: "web",
    });
    registerRoute(routeStore, {
      hostname: "docs.localhost",
      port: 3003,
      workspaceId: "workspace-b",
      scriptName: "docs",
    });

    const emitScriptStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitScriptStatusUpdate,
    });

    handleBranchChange("workspace-a", "feature/auth", "feature/billing");

    expect(routeStore.listRoutesForWorkspace("workspace-a")).toEqual([
      {
        hostname: "feature-billing.api.localhost",
        port: 3001,
        workspaceId: "workspace-a",
        scriptName: "api",
      },
      {
        hostname: "feature-billing.web.localhost",
        port: 3002,
        workspaceId: "workspace-a",
        scriptName: "web",
      },
    ]);
    expect(routeStore.listRoutesForWorkspace("workspace-b")).toEqual([
      {
        hostname: "docs.localhost",
        port: 3003,
        workspaceId: "workspace-b",
        scriptName: "docs",
      },
    ]);
  });

  it("does not emit a status update when no changes are needed", () => {
    const routeStore = new ScriptRouteStore();
    registerRoute(routeStore, {
      hostname: "web.localhost",
      port: 3002,
      scriptName: "web",
    });

    const emitScriptStatusUpdate = vi.fn();
    const handleBranchChange = createBranchChangeRouteHandler({
      routeStore,
      emitScriptStatusUpdate,
    });

    handleBranchChange("workspace-a", null, "main");

    expect(emitScriptStatusUpdate).not.toHaveBeenCalled();
  });
});
