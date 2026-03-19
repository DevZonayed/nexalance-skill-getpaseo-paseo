import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMock = vi.hoisted(() => {
  let listenerCleanup: (() => void) | null = null;
  let disconnectCount = 0;

  const connect = vi.fn(async () => {
    let listenerActive = false;

    return {
      addListener: vi.fn(() => {
        listenerActive = true;
        listenerCleanup = vi.fn(() => {
          if (!listenerActive) {
            throw new TypeError(
              "undefined is not an object (evaluating 'listeners[eventId].handlerId')"
            );
          }
          listenerActive = false;
        });
        return listenerCleanup;
      }),
      send: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => {
        disconnectCount += 1;
        listenerCleanup?.();
      }),
    };
  });

  return {
    connect,
    getListenerCleanup: () => listenerCleanup,
    getDisconnectCount: () => disconnectCount,
    resetState: () => {
      listenerCleanup = null;
      disconnectCount = 0;
    },
  };
});

vi.mock("./tauri", () => ({
  getTauri: () => ({
    websocket: {
      connect: tauriMock.connect,
    },
  }),
}));

describe("tauri-daemon-transport", () => {
  beforeEach(() => {
    tauriMock.connect.mockClear();
    tauriMock.resetState();
  });

  it("does not unregister the websocket listener twice during close", async () => {
    const mod = await import("./tauri-daemon-transport");
    const transportFactory = mod.createTauriWebSocketTransportFactory();
    expect(transportFactory).not.toBeNull();

    const transport = transportFactory!({ url: "ws://localhost:6767/ws" });
    await Promise.resolve();

    expect(() => transport.close()).not.toThrow();
    await Promise.resolve();
    expect(tauriMock.getListenerCleanup()).toHaveBeenCalledTimes(1);
  });

  it("disconnects the websocket only once after the connection is already open", async () => {
    const mod = await import("./tauri-daemon-transport");
    const transportFactory = mod.createTauriWebSocketTransportFactory();
    expect(transportFactory).not.toBeNull();

    const transport = transportFactory!({ url: "ws://localhost:6767/ws" });
    await Promise.resolve();
    await Promise.resolve();

    expect(() => transport.close()).not.toThrow();
    await Promise.resolve();

    expect(tauriMock.getDisconnectCount()).toBe(1);
    expect(tauriMock.getListenerCleanup()).toHaveBeenCalledTimes(1);
  });

  it("disconnects only once when close happens during async connect cleanup", async () => {
    let resolveConnect!: (socket: any) => void;
    let resolveSend!: () => void;

    tauriMock.connect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConnect = resolve;
        })
    );

    const mod = await import("./tauri-daemon-transport");
    const transportFactory = mod.createTauriWebSocketTransportFactory();
    expect(transportFactory).not.toBeNull();

    const disconnect = vi.fn(async () => undefined);
    const addListener = vi.fn(() => vi.fn());
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        })
    );

    const transport = transportFactory!({ url: "ws://localhost:6767/ws" });
    transport.send("queued-before-connect");

    resolveConnect({ addListener, send, disconnect });
    await Promise.resolve();

    transport.close();
    resolveSend();
    await Promise.resolve();
    await Promise.resolve();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("swallows the tauri duplicate-listener cleanup error when disconnect throws synchronously", async () => {
    tauriMock.connect.mockImplementationOnce(async () => ({
      addListener: vi.fn(() => vi.fn()),
      send: vi.fn(async () => undefined),
      disconnect: vi.fn(() => {
        throw new TypeError(
          "undefined is not an object (evaluating 'listeners[eventId].handlerId')"
        );
      }),
    }));

    const mod = await import("./tauri-daemon-transport");
    const transportFactory = mod.createTauriWebSocketTransportFactory();
    expect(transportFactory).not.toBeNull();

    const transport = transportFactory!({ url: "ws://localhost:6767/ws" });
    await Promise.resolve();

    expect(() => transport.close()).not.toThrow();
  });
});
