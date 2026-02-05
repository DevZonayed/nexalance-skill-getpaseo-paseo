import { DaemonClient } from "@server/client/daemon-client";
import type { ConnectionState } from "@server/client/daemon-client";
import { buildDaemonWebSocketUrl } from "./daemon-endpoints";
import { createTauriWebSocketTransportFactory } from "./tauri-daemon-transport";

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickBestReason(reason: string | null, lastError: string | null): string {
  const genericReason =
    reason &&
    (reason.toLowerCase() === "transport error" || reason.toLowerCase() === "transport closed");
  const genericLastError =
    lastError &&
    (lastError.toLowerCase() === "transport error" ||
      lastError.toLowerCase() === "transport closed" ||
      lastError.toLowerCase() === "unable to connect");

  if (genericReason && lastError && !genericLastError) {
    return lastError;
  }
  if (reason) return reason;
  if (lastError) return lastError;
  return "Unable to connect";
}

export class DaemonConnectionTestError extends Error {
  reason: string | null;
  lastError: string | null;

  constructor(message: string, details: { reason: string | null; lastError: string | null }) {
    super(message);
    this.name = "DaemonConnectionTestError";
    this.reason = details.reason;
    this.lastError = details.lastError;
  }
}

export async function probeDaemonEndpoint(
  endpoint: string,
  options?: { timeoutMs?: number }
): Promise<{ serverId: string; hostname: string | null }> {
  const timeoutMs = options?.timeoutMs ?? 6000;
  const url = buildDaemonWebSocketUrl(endpoint);

  const tauriTransportFactory = createTauriWebSocketTransportFactory();
  const client = new DaemonClient({
    url,
    suppressSendErrors: true,
    ...(tauriTransportFactory ? { transportFactory: tauriTransportFactory } : {}),
  });

  try {
    return await new Promise<{ serverId: string; hostname: string | null }>((resolve, reject) => {
      let cleanedUp = false;
      let unsubscribe: (() => void) | null = null;
      let unsubscribeStatus: (() => void) | null = null;
      let serverId: string | null = null;
      let hostname: string | null = null;

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearTimeout(timeout);
        unsubscribe?.();
        unsubscribeStatus?.();
      };

      const maybeFinishOk = () => {
        if (!serverId) return;
        cleanup();
        resolve({ serverId, hostname });
      };

      const finishErr = (error: Error) => {
        if (cleanedUp) return;
        cleanup();
        reject(error);
      };

      const timeout = setTimeout(() => {
        finishErr(
          new DaemonConnectionTestError("Connection timed out", {
            reason: "Connection timed out",
            lastError: client.lastError ?? null,
          })
        );
      }, timeoutMs);

      unsubscribe = client.subscribeConnectionStatus((state) => {
        if (state.status === "disconnected") {
          const reason = normalizeNonEmptyString(state.reason);
          const lastError = normalizeNonEmptyString(client.lastError);
          const message = pickBestReason(reason, lastError);
          finishErr(new DaemonConnectionTestError(message, { reason, lastError }));
        }
      });

      unsubscribeStatus = client.on("status", (message) => {
        if (message.type !== "status") return;
        const payload = message.payload as { status?: unknown; serverId?: unknown; hostname?: unknown };
        if (payload?.status !== "server_info") return;
        const raw = typeof payload.serverId === "string" ? payload.serverId.trim() : "";
        if (!raw) return;
        serverId = raw;
        hostname = typeof payload.hostname === "string" ? payload.hostname.trim() : null;
        if (hostname && hostname.length === 0) {
          hostname = null;
        }
        maybeFinishOk();
      });

      void client.connect().catch(() => undefined);
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}
