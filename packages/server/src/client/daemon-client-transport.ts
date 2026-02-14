import {
  createClientChannel,
  type EncryptedChannel,
  type Transport as RelayTransport,
} from "@getpaseo/relay/e2ee";

export type DaemonTransport = {
  send: (data: string | Uint8Array | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: (handler: (data: unknown) => void) => () => void;
  onOpen: (handler: () => void) => () => void;
  onClose: (handler: (event?: unknown) => void) => () => void;
  onError: (handler: (event?: unknown) => void) => () => void;
};

export type DaemonTransportFactory = (options: {
  url: string;
  headers?: Record<string, string>;
}) => DaemonTransport;

export type WebSocketFactory = (
  url: string,
  options?: { headers?: Record<string, string> }
) => WebSocketLike;

export type WebSocketLike = {
  readyState: number;
  send: (data: string | Uint8Array | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
  binaryType?: string;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  off?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  addEventListener?: (event: string, listener: (event: any) => void) => void;
  removeEventListener?: (event: string, listener: (event: any) => void) => void;
  onopen?: ((event: any) => void) | null;
  onclose?: ((event: any) => void) | null;
  onerror?: ((event: any) => void) | null;
  onmessage?: ((event: any) => void) | null;
};

export interface TransportLogger {
  warn(obj: object, msg?: string): void;
}

export function defaultWebSocketFactory(
  url: string,
  _options?: { headers?: Record<string, string> }
): WebSocketLike {
  const globalWs = (globalThis as { WebSocket?: any }).WebSocket;
  if (!globalWs) {
    throw new Error("WebSocket is not available in this runtime");
  }
  return new globalWs(url);
}

export function createWebSocketTransportFactory(
  factory: WebSocketFactory
): DaemonTransportFactory {
  return ({ url, headers }) => {
    const ws = factory(url, { headers });
    if ("binaryType" in ws) {
      try {
        ws.binaryType = "arraybuffer";
      } catch {
        // no-op
      }
    }
    return {
      send: (data) => {
        if (typeof ws.readyState === "number" && ws.readyState !== 1) {
          throw new Error(`WebSocket not open (readyState=${ws.readyState})`);
        }
        ws.send(data);
      },
      close: (code?: number, reason?: string) => ws.close(code, reason),
      onOpen: (handler) => bindWsHandler(ws, "open", handler),
      onClose: (handler) => bindWsHandler(ws, "close", handler),
      onError: (handler) => bindWsHandler(ws, "error", handler),
      onMessage: (handler) => bindWsHandler(ws, "message", handler),
    };
  };
}

export function createRelayE2eeTransportFactory(args: {
  baseFactory: DaemonTransportFactory;
  daemonPublicKeyB64: string;
  logger: TransportLogger;
}): DaemonTransportFactory {
  return ({ url, headers }) => {
    const base = args.baseFactory({ url, headers });
    return createEncryptedTransport(base, args.daemonPublicKeyB64, args.logger);
  };
}

export function createEncryptedTransport(
  base: DaemonTransport,
  daemonPublicKeyB64: string,
  logger: TransportLogger
): DaemonTransport {
  let channel: EncryptedChannel | null = null;
  let opened = false;
  let closed = false;

  const openHandlers = new Set<() => void>();
  const closeHandlers = new Set<(event?: unknown) => void>();
  const errorHandlers = new Set<(event?: unknown) => void>();
  const messageHandlers = new Set<(data: unknown) => void>();

  const emitOpen = () => {
    if (opened || closed) return;
    opened = true;
    for (const handler of openHandlers) {
      try {
        handler();
      } catch {
        // no-op
      }
    }
  };

  const emitClose = (event?: unknown) => {
    if (closed) return;
    closed = true;
    for (const handler of closeHandlers) {
      try {
        handler(event);
      } catch {
        // no-op
      }
    }
  };

  const emitError = (event?: unknown) => {
    if (closed) return;
    for (const handler of errorHandlers) {
      try {
        handler(event);
      } catch {
        // no-op
      }
    }
  };

  const emitMessage = (data: unknown) => {
    if (closed) return;
    for (const handler of messageHandlers) {
      try {
        handler(data);
      } catch {
        // no-op
      }
    }
  };

  const relayTransport: RelayTransport = {
    send: (data) => {
      if (typeof data === "string") {
        base.send(data);
        return;
      }
      if (ArrayBuffer.isView(data)) {
        const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const out = new Uint8Array(view.byteLength);
        out.set(view);
        base.send(out.buffer);
        return;
      }
      if (data instanceof ArrayBuffer) {
        if (typeof TextDecoder !== "undefined") {
          base.send(data);
          return;
        }
        if (typeof Buffer !== "undefined") {
          base.send(data);
          return;
        }
        base.send(data);
        return;
      }
      base.send(String(data));
    },
    close: (code?: number, reason?: string) => base.close(code, reason),
    onmessage: null,
    onclose: null,
    onerror: null,
  };

  const startHandshake = async () => {
    try {
      channel = await createClientChannel(relayTransport, daemonPublicKeyB64, {
        onopen: emitOpen,
        onmessage: (data) => emitMessage(data),
        onclose: (code, reason) => emitClose({ code, reason }),
        onerror: (error) => emitError(error),
      });
    } catch (error) {
      logger.warn({ err: error }, "relay_e2ee_handshake_failed");
      emitError(error);
      base.close(1011, "E2EE handshake failed");
    }
  };

  base.onOpen(() => {
    void startHandshake();
  });
  base.onMessage((event) => {
    relayTransport.onmessage?.(extractRelayMessageData(event));
  });
  base.onClose((event) => {
    const record = event as { code?: number; reason?: string } | undefined;
    relayTransport.onclose?.(record?.code ?? 0, record?.reason ?? "");
    emitClose(event);
  });
  base.onError((event) => {
    relayTransport.onerror?.(
      event instanceof Error ? event : new Error(String(event))
    );
    emitError(event);
  });

  return {
    send: (data) => {
      if (!channel) {
        throw new Error("Encrypted channel not ready");
      }
      const outbound =
        typeof data === "string"
          ? data
          : data instanceof ArrayBuffer
            ? data
            : ArrayBuffer.isView(data)
              ? (() => {
                  const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                  const out = new Uint8Array(view.byteLength);
                  out.set(view);
                  return out.buffer;
                })()
              : String(data);
      void channel.send(outbound).catch((error) => {
        emitError(error);
      });
    },
    close: (code?: number, reason?: string) => {
      if (channel) {
        channel.close(code, reason);
      } else {
        base.close(code, reason);
      }
      emitClose({ code, reason });
    },
    onMessage: (handler) => {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onOpen: (handler) => {
      openHandlers.add(handler);
      if (opened) {
        try {
          handler();
        } catch {
          // no-op
        }
      }
      return () => openHandlers.delete(handler);
    },
    onClose: (handler) => {
      closeHandlers.add(handler);
      if (closed) {
        try {
          handler();
        } catch {
          // no-op
        }
      }
      return () => closeHandlers.delete(handler);
    },
    onError: (handler) => {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
  };
}

export function extractRelayMessageData(event: unknown): string | ArrayBuffer {
  const raw =
    event && typeof event === "object" && "data" in event
      ? (event as { data: unknown }).data
      : event;
  if (typeof raw === "string") return raw;
  if (raw instanceof ArrayBuffer) return raw;
  if (ArrayBuffer.isView(raw)) {
    const view = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const out = new Uint8Array(view.byteLength);
    out.set(view);
    return out.buffer;
  }
  return String(raw ?? "");
}

export function bindWsHandler(
  ws: WebSocketLike,
  event: "open" | "close" | "error" | "message",
  handler: (...args: any[]) => void
): () => void {
  if (typeof ws.addEventListener === "function") {
    ws.addEventListener(event, handler);
    return () => {
      if (typeof ws.removeEventListener === "function") {
        ws.removeEventListener(event, handler);
      }
    };
  }
  if (typeof ws.on === "function") {
    ws.on(event, handler);
    return () => {
      if (typeof ws.off === "function") {
        ws.off(event, handler);
        return;
      }
      if (typeof ws.removeListener === "function") {
        ws.removeListener(event, handler);
      }
    };
  }
  const prop = `on${event}` as "onopen" | "onclose" | "onerror" | "onmessage";
  const previous = (ws as any)[prop];
  (ws as any)[prop] = handler;
  return () => {
    if ((ws as any)[prop] === handler) {
      (ws as any)[prop] = previous ?? null;
    }
  };
}

export function describeTransportClose(event?: unknown): string {
  if (!event) {
    return "Transport closed";
  }
  if (event instanceof Error) {
    return event.message;
  }
  if (typeof event === "string") {
    return event;
  }
  if (typeof event === "object") {
    const record = event as { reason?: unknown; message?: unknown; code?: unknown };
    if (typeof record.reason === "string" && record.reason.trim().length > 0) {
      return record.reason.trim();
    }
    if (typeof record.message === "string" && record.message.trim().length > 0) {
      return record.message.trim();
    }
    if (typeof record.code === "number") {
      return `Transport closed (code ${record.code})`;
    }
  }
  return "Transport closed";
}

export function describeTransportError(event?: unknown): string {
  if (!event) {
    return "Transport error";
  }
  if (event instanceof Error) {
    return event.message;
  }
  if (typeof event === "string") {
    return event;
  }
  if (typeof event === "object") {
    const record = event as { message?: unknown };
    if (typeof record.message === "string" && record.message.trim().length > 0) {
      return record.message.trim();
    }
  }
  return "Transport error";
}

export function safeRandomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function decodeMessageData(data: unknown): string | null {
  if (data === null || data === undefined) {
    return null;
  }
  if (typeof data === "string") {
    return data;
  }
  if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(data).toString("utf8");
    }
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(data);
    }
  }
  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(
      data.buffer,
      data.byteOffset,
      data.byteLength
    );
    if (typeof Buffer !== "undefined") {
      return Buffer.from(view).toString("utf8");
    }
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(view);
    }
  }
  if (typeof (data as { toString?: () => string }).toString === "function") {
    return (data as { toString: () => string }).toString();
  }
  return null;
}

export function encodeUtf8String(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "utf8"));
  }
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}
