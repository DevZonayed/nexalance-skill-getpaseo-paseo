import net from "node:net";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import type { Logger } from "pino";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

type BridgeServer = {
  connect: (transport: StdioServerTransport) => Promise<void>;
  close?: () => Promise<void>;
};

type BridgeEntry = {
  socketPath: string;
  server: net.Server;
  sockets: Set<net.Socket>;
};

export type VoiceMcpSocketBridgeManager = {
  ensureBridgeForCaller: (callerAgentId: string) => Promise<string>;
  removeBridgeForCaller: (callerAgentId: string) => Promise<void>;
  stop: () => Promise<void>;
};

function toSocketName(callerAgentId: string): string {
  return `voice-mcp-${callerAgentId}.sock`;
}

export function createVoiceMcpSocketBridgeManager(params: {
  runtimeDir: string;
  logger: Logger;
  createAgentMcpServerForCaller: (callerAgentId: string) => Promise<BridgeServer>;
}): VoiceMcpSocketBridgeManager {
  const logger = params.logger.child({ module: "voice-mcp-bridge" });
  const entries = new Map<string, BridgeEntry>();
  const pendingCreates = new Map<string, Promise<string>>();

  const ensureBridgeForCaller = async (callerAgentId: string): Promise<string> => {
    const existing = entries.get(callerAgentId);
    if (existing) {
      return existing.socketPath;
    }

    const pending = pendingCreates.get(callerAgentId);
    if (pending) {
      return pending;
    }

    const createPromise = (async () => {
      const socketPath = path.join(params.runtimeDir, toSocketName(callerAgentId));
      const sockets = new Set<net.Socket>();
      const server = net.createServer((socket) => {
        sockets.add(socket);
        const connectionLogger = logger.child({ callerAgentId, component: "connection" });

        let mcpServer: BridgeServer | null = null;
        let transport: StdioServerTransport | null = null;

        const cleanup = async () => {
          sockets.delete(socket);
          await Promise.all([
            transport?.close().catch(() => undefined),
            mcpServer?.close?.().catch(() => undefined),
          ]);
        };

        socket.on("error", (error) => {
          connectionLogger.error({ err: error }, "Voice MCP bridge socket error");
        });
        socket.on("close", () => {
          void cleanup();
        });

        void (async () => {
          try {
            mcpServer = await params.createAgentMcpServerForCaller(callerAgentId);
            transport = new StdioServerTransport(socket, socket);
            await mcpServer.connect(transport);
          } catch (error) {
            connectionLogger.error(
              { err: error, callerAgentId },
              "Failed to initialize stream-level MCP bridge connection"
            );
            socket.destroy();
          }
        })();
      });

      await mkdir(params.runtimeDir, { recursive: true });
      await rm(socketPath, { force: true }).catch(() => undefined);
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, () => {
          server.off("error", reject);
          resolve();
        });
      });

      entries.set(callerAgentId, { socketPath, server, sockets });
      logger.info(
        { callerAgentId, socketPath },
        "Voice MCP per-agent socket bridge listening"
      );
      return socketPath;
    })();

    pendingCreates.set(callerAgentId, createPromise);
    try {
      return await createPromise;
    } finally {
      pendingCreates.delete(callerAgentId);
    }
  };

  const removeBridgeForCaller = async (callerAgentId: string): Promise<void> => {
    const entry = entries.get(callerAgentId);
    if (!entry) {
      return;
    }
    entries.delete(callerAgentId);

    for (const socket of entry.sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve, reject) => {
      entry.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await rm(entry.socketPath, { force: true }).catch(() => undefined);
    logger.info({ callerAgentId, socketPath: entry.socketPath }, "Voice MCP socket bridge removed");
  };

  const stop = async (): Promise<void> => {
    const activeCallerIds = Array.from(entries.keys());
    for (const callerAgentId of activeCallerIds) {
      await removeBridgeForCaller(callerAgentId).catch((error) => {
        logger.warn({ err: error, callerAgentId }, "Failed to stop voice MCP socket bridge");
      });
    }
  };

  return {
    ensureBridgeForCaller,
    removeBridgeForCaller,
    stop,
  };
}
