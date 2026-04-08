import net from "node:net";
import { scheduler } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findFreePort, ScriptRouteStore } from "./script-proxy.js";
import {
  ScriptHealthMonitor,
  type ScriptHealthEntry,
} from "./script-health-monitor.js";

type TcpServerHandle = {
  port: number;
  server: net.Server;
};

async function startTcpServer(): Promise<TcpServerHandle> {
  const server = net.createServer((socket) => {
    socket.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve TCP server address");
  }

  return { port: address.port, server };
}

async function closeServer(server: net.Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function advancePoll(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 20; i += 1) {
    await scheduler.yield();
  }
}

describe("ScriptHealthMonitor", () => {
  const servers = new Set<net.Server>();

  afterEach(async () => {
    vi.useRealTimers();

    for (const server of servers) {
      await closeServer(server);
    }
    servers.clear();
  });

  it("marks a healthy port as running after successful TCP connect", async () => {
    vi.useFakeTimers();

    const healthy = await startTcpServer();
    servers.add(healthy.server);

    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: healthy.port,
      workspaceId: "workspace-a",
      scriptName: "api",
    });

    const onChange = vi.fn<(workspaceId: string, services: ScriptHealthEntry[]) => void>();
    const monitor = new ScriptHealthMonitor({
      routeStore,
      onChange,
      pollIntervalMs: 1_000,
      probeTimeoutMs: 100,
      graceMs: 0,
    });

    monitor.start();
    await advancePoll(1_000);
    monitor.stop();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("workspace-a", [
      {
        scriptName: "api",
        hostname: "api.localhost",
        port: healthy.port,
        health: "healthy",
      },
    ]);
  });

  it("marks an unreachable port as stopped after consecutive failures", async () => {
    vi.useFakeTimers();

    const deadPort = await findFreePort();
    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: deadPort,
      workspaceId: "workspace-a",
      scriptName: "api",
    });

    const onChange = vi.fn<(workspaceId: string, services: ScriptHealthEntry[]) => void>();
    const monitor = new ScriptHealthMonitor({
      routeStore,
      onChange,
      pollIntervalMs: 1_000,
      probeTimeoutMs: 100,
      graceMs: 0,
      failuresBeforeStopped: 2,
    });

    monitor.start();
    await advancePoll(1_000);
    expect(onChange).not.toHaveBeenCalled();

    await advancePoll(1_000);
    monitor.stop();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("workspace-a", [
      {
        scriptName: "api",
        hostname: "api.localhost",
        port: deadPort,
        health: "unhealthy",
      },
    ]);
  });

  it("does not emit when status has not changed", async () => {
    vi.useFakeTimers();

    const healthy = await startTcpServer();
    servers.add(healthy.server);

    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: healthy.port,
      workspaceId: "workspace-a",
      scriptName: "api",
    });

    const onChange = vi.fn<(workspaceId: string, services: ScriptHealthEntry[]) => void>();
    const monitor = new ScriptHealthMonitor({
      routeStore,
      onChange,
      pollIntervalMs: 1_000,
      probeTimeoutMs: 100,
      graceMs: 0,
    });

    monitor.start();
    await advancePoll(3_000);
    monitor.stop();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("respects startup grace period — does not probe newly registered routes for 5 seconds", async () => {
    vi.useFakeTimers();

    const healthy = await startTcpServer();
    servers.add(healthy.server);

    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: healthy.port,
      workspaceId: "workspace-a",
      scriptName: "api",
    });

    const onChange = vi.fn<(workspaceId: string, services: ScriptHealthEntry[]) => void>();
    const monitor = new ScriptHealthMonitor({
      routeStore,
      onChange,
      pollIntervalMs: 1_000,
      probeTimeoutMs: 100,
      graceMs: 5_000,
    });

    monitor.start();
    await advancePoll(4_000);
    expect(onChange).not.toHaveBeenCalled();

    await advancePoll(1_000);
    monitor.stop();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("workspace-a", [
      {
        scriptName: "api",
        hostname: "api.localhost",
        port: healthy.port,
        health: "healthy",
      },
    ]);
  });

  it("requires 2 consecutive failures before marking stopped (debounce)", async () => {
    vi.useFakeTimers();

    const healthy = await startTcpServer();
    servers.add(healthy.server);

    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: healthy.port,
      workspaceId: "workspace-a",
      scriptName: "api",
    });

    const onChange = vi.fn<(workspaceId: string, services: ScriptHealthEntry[]) => void>();
    const monitor = new ScriptHealthMonitor({
      routeStore,
      onChange,
      pollIntervalMs: 1_000,
      probeTimeoutMs: 100,
      graceMs: 0,
      failuresBeforeStopped: 2,
    });

    monitor.start();
    await advancePoll(1_000);
    expect(onChange).toHaveBeenCalledTimes(1);

    await closeServer(healthy.server);
    servers.delete(healthy.server);

    await advancePoll(1_000);
    expect(onChange).toHaveBeenCalledTimes(1);

    await advancePoll(1_000);
    monitor.stop();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith("workspace-a", [
      {
        scriptName: "api",
        hostname: "api.localhost",
        port: healthy.port,
        health: "unhealthy",
      },
    ]);
  });

  it("stops probing routes that are removed from the store", async () => {
    vi.useFakeTimers();

    const healthy = await startTcpServer();
    servers.add(healthy.server);

    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: healthy.port,
      workspaceId: "workspace-a",
      scriptName: "api",
    });

    const onChange = vi.fn<(workspaceId: string, services: ScriptHealthEntry[]) => void>();
    const monitor = new ScriptHealthMonitor({
      routeStore,
      onChange,
      pollIntervalMs: 1_000,
      probeTimeoutMs: 100,
      graceMs: 0,
      failuresBeforeStopped: 2,
    });

    monitor.start();
    await advancePoll(1_000);
    expect(onChange).toHaveBeenCalledTimes(1);

    routeStore.removeRoute("api.localhost");
    await closeServer(healthy.server);
    servers.delete(healthy.server);

    await advancePoll(3_000);
    monitor.stop();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("calls onChange with workspaceId and full service list when status transitions", async () => {
    vi.useFakeTimers();

    const api = await startTcpServer();
    const web = await startTcpServer();
    servers.add(api.server);
    servers.add(web.server);

    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: api.port,
      workspaceId: "workspace-a",
      scriptName: "api",
    });
    routeStore.registerRoute({
      hostname: "web.localhost",
      port: web.port,
      workspaceId: "workspace-a",
      scriptName: "web",
    });

    const onChange = vi.fn<(workspaceId: string, services: ScriptHealthEntry[]) => void>();
    const monitor = new ScriptHealthMonitor({
      routeStore,
      onChange,
      pollIntervalMs: 1_000,
      probeTimeoutMs: 100,
      graceMs: 0,
    });

    monitor.start();
    await advancePoll(1_000);
    monitor.stop();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("workspace-a", [
      {
        scriptName: "api",
        hostname: "api.localhost",
        port: api.port,
        health: "healthy",
      },
      {
        scriptName: "web",
        hostname: "web.localhost",
        port: web.port,
        health: "healthy",
      },
    ]);
  });

  it("getHealthForHostname returns current health after probe", async () => {
    vi.useFakeTimers();

    const healthy = await startTcpServer();
    servers.add(healthy.server);

    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: healthy.port,
      workspaceId: "workspace-a",
      scriptName: "api",
    });

    const onChange = vi.fn<(workspaceId: string, services: ScriptHealthEntry[]) => void>();
    const monitor = new ScriptHealthMonitor({
      routeStore,
      onChange,
      pollIntervalMs: 1_000,
      probeTimeoutMs: 100,
      graceMs: 0,
    });

    expect(monitor.getHealthForHostname("api.localhost")).toBeNull();

    monitor.start();
    await advancePoll(1_000);
    monitor.stop();

    expect(monitor.getHealthForHostname("api.localhost")).toBe("healthy");
    expect(monitor.getHealthForHostname("unknown.localhost")).toBeNull();
  });

  it("coalesces multiple service changes in same workspace into one onChange call per poll cycle", async () => {
    vi.useFakeTimers();

    const api = await startTcpServer();
    const web = await startTcpServer();
    servers.add(api.server);
    servers.add(web.server);

    const routeStore = new ScriptRouteStore();
    routeStore.registerRoute({
      hostname: "api.localhost",
      port: api.port,
      workspaceId: "workspace-a",
      scriptName: "api",
    });
    routeStore.registerRoute({
      hostname: "web.localhost",
      port: web.port,
      workspaceId: "workspace-a",
      scriptName: "web",
    });

    const onChange = vi.fn<(workspaceId: string, services: ScriptHealthEntry[]) => void>();
    const monitor = new ScriptHealthMonitor({
      routeStore,
      onChange,
      pollIntervalMs: 1_000,
      probeTimeoutMs: 100,
      graceMs: 0,
      failuresBeforeStopped: 2,
    });

    monitor.start();
    await advancePoll(1_000);
    expect(onChange).toHaveBeenCalledTimes(1);

    onChange.mockClear();
    await closeServer(api.server);
    await closeServer(web.server);
    servers.delete(api.server);
    servers.delete(web.server);

    await advancePoll(1_000);
    expect(onChange).not.toHaveBeenCalled();

    await advancePoll(1_000);
    monitor.stop();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("workspace-a", [
      {
        scriptName: "api",
        hostname: "api.localhost",
        port: api.port,
        health: "unhealthy",
      },
      {
        scriptName: "web",
        hostname: "web.localhost",
        port: web.port,
        health: "unhealthy",
      },
    ]);
  });
});
