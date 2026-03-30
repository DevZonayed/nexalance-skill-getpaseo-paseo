import http from "node:http";
import net from "node:net";
import type { IncomingMessage } from "node:http";
import type { Logger } from "pino";
import type { RequestHandler } from "express";

// ---------------------------------------------------------------------------
// Hop-by-hop headers that must not be forwarded
// ---------------------------------------------------------------------------

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
]);

// ---------------------------------------------------------------------------
// ServiceRouteStore
// ---------------------------------------------------------------------------

export interface ServiceRoute {
  hostname: string;
  port: number;
}

export class ServiceRouteStore {
  private routes = new Map<string, number>();

  addRoute(hostname: string, port: number): void {
    this.routes.set(hostname, port);
  }

  removeRoute(hostname: string): void {
    this.routes.delete(hostname);
  }

  removeRoutesForPort(port: number): void {
    for (const [hostname, p] of this.routes) {
      if (p === port) {
        this.routes.delete(hostname);
      }
    }
  }

  findRoute(host: string): ServiceRoute | null {
    // Strip port suffix from the Host header value
    const hostname = host.replace(/:\d+$/, "");

    // 1. Exact match
    const exactPort = this.routes.get(hostname);
    if (exactPort !== undefined) {
      return { hostname, port: exactPort };
    }

    // 2. Subdomain match — walk up the labels looking for a registered parent
    const parts = hostname.split(".");
    for (let i = 1; i < parts.length; i++) {
      const candidate = parts.slice(i).join(".");
      const candidatePort = this.routes.get(candidate);
      if (candidatePort !== undefined) {
        return { hostname: candidate, port: candidatePort };
      }
    }

    return null;
  }

  listRoutes(): ServiceRoute[] {
    return Array.from(this.routes.entries()).map(([hostname, port]) => ({
      hostname,
      port,
    }));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHopByHopHeaders(
  rawHeaders: http.IncomingHttpHeaders,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// createServiceProxyMiddleware
// ---------------------------------------------------------------------------

export function createServiceProxyMiddleware({
  routeStore,
  logger,
}: {
  routeStore: ServiceRouteStore;
  logger: Logger;
}): RequestHandler {
  return (req, res, next) => {
    const hostHeader = req.headers.host;
    if (!hostHeader) {
      next();
      return;
    }

    const route = routeStore.findRoute(hostHeader);
    if (!route) {
      next();
      return;
    }

    const forwardedHeaders = stripHopByHopHeaders(req.headers);
    forwardedHeaders["x-forwarded-for"] =
      req.socket.remoteAddress ?? "127.0.0.1";
    forwardedHeaders["x-forwarded-host"] = hostHeader.replace(/:\d+$/, "");
    forwardedHeaders["x-forwarded-proto"] = req.protocol;

    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: route.port,
        path: req.originalUrl,
        method: req.method,
        headers: forwardedHeaders,
      },
      (proxyRes) => {
        const responseHeaders = stripHopByHopHeaders(proxyRes.headers);
        res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
        proxyRes.pipe(res, { end: true });
      },
    );

    proxyReq.on("error", (err) => {
      logger.warn(
        { err, hostname: route.hostname, port: route.port },
        "Service proxy: upstream unreachable",
      );
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end("502 Bad Gateway");
      }
    });

    req.pipe(proxyReq, { end: true });
  };
}

// ---------------------------------------------------------------------------
// createServiceProxyUpgradeHandler
// ---------------------------------------------------------------------------

export function createServiceProxyUpgradeHandler({
  routeStore,
  logger,
}: {
  routeStore: ServiceRouteStore;
  logger: Logger;
}): (req: IncomingMessage, socket: net.Socket, head: Buffer) => void {
  return (req, socket, head) => {
    const hostHeader = req.headers.host;
    if (!hostHeader) {
      return;
    }

    const route = routeStore.findRoute(hostHeader);
    if (!route) {
      return;
    }

    const targetSocket = net.connect(
      { host: "127.0.0.1", port: route.port },
      () => {
        // Reconstruct the raw HTTP upgrade request to send to the target
        const forwardedHeaders = stripHopByHopHeaders(req.headers);
        forwardedHeaders["x-forwarded-for"] =
          req.socket.remoteAddress ?? "127.0.0.1";
        forwardedHeaders["x-forwarded-host"] = hostHeader.replace(/:\d+$/, "");
        forwardedHeaders["x-forwarded-proto"] = "http";

        // Re-include upgrade and connection headers — they are required for
        // WebSocket handshake even though they are hop-by-hop.
        forwardedHeaders["connection"] = "Upgrade";
        forwardedHeaders["upgrade"] = req.headers.upgrade ?? "websocket";

        const headerLines: string[] = [];
        headerLines.push(
          `${req.method ?? "GET"} ${req.url ?? "/"} HTTP/${req.httpVersion}`,
        );
        for (const [key, value] of Object.entries(forwardedHeaders)) {
          if (Array.isArray(value)) {
            for (const v of value) {
              headerLines.push(`${key}: ${v}`);
            }
          } else {
            headerLines.push(`${key}: ${value}`);
          }
        }
        headerLines.push("\r\n");

        targetSocket.write(headerLines.join("\r\n"));

        if (head.length > 0) {
          targetSocket.write(head);
        }

        // Pipe in both directions
        targetSocket.pipe(socket);
        socket.pipe(targetSocket);
      },
    );

    targetSocket.on("error", (err) => {
      logger.warn(
        { err, hostname: route.hostname, port: route.port },
        "Service proxy: WebSocket upstream unreachable",
      );
      socket.end();
    });

    socket.on("error", () => {
      targetSocket.destroy();
    });
  };
}

// ---------------------------------------------------------------------------
// findFreePort
// ---------------------------------------------------------------------------

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to get assigned port"));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve(port);
        }
      });
    });
    server.on("error", reject);
  });
}
