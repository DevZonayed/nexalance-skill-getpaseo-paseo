import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMock = vi.hoisted(() => {
  let listenerCleanup: (() => void) | null = null;

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
        listenerCleanup?.();
      }),
    };
  });

  return {
    connect,
    getListenerCleanup: () => listenerCleanup,
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
  });

  it("does not unregister the websocket listener twice during close", async () => {
    const mod = await import("./tauri-daemon-transport");
    const transportFactory = mod.createTauriWebSocketTransportFactory();
    expect(transportFactory).not.toBeNull();

    const transport = transportFactory!({ url: "ws://localhost:6767/ws" });
    await Promise.resolve();

    expect(() => transport.close()).not.toThrow();
    expect(tauriMock.getListenerCleanup()).toHaveBeenCalledTimes(1);
  });
});
