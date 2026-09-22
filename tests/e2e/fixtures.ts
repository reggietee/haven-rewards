import { test as base, expect } from "@playwright/test";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
/** WebKit's setOffline rejects even synthetic SW responses on this host.
 * Closing the origin's TCP listener tests actual server loss without bypassing the worker. */
type SyncBody = { records: { id: string; tab: string; seq: number }[] };
export const test = base.extend<{
  network: {
    url: string;
    offline: (value: boolean) => Promise<void>;
    mockSync?: (handler: (body: SyncBody) => { accepted: string[] }) => void;
  };
}>({
  network: async ({ browserName, context, baseURL }, use) => {
    if (browserName !== "webkit") {
      await use({
        url: baseURL!,
        offline: (value) => context.setOffline(value),
      });
      return;
    }
    const target = new URL(baseURL!);
    let port = 0;
    let server: Server | undefined;
    let syncHandler: ((body: SyncBody) => { accepted: string[] }) | undefined;
    async function start() {
      server = createServer((req, res) => {
        if (req.url === "/api/sync" && syncHandler) {
          let body = "";
          req.on("data", (chunk) => (body += String(chunk)));
          req.on("end", () => {
            try {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(syncHandler!(JSON.parse(body))));
            } catch {
              res.end();
            }
          });
          return;
        }
        const headers = { ...req.headers, host: target.host };
        if (headers.origin) headers.origin = target.origin;
        const upstream = request(
          {
            hostname: target.hostname,
            port: target.port,
            path: req.url,
            method: req.method,
            headers,
          },
          (response) => {
            res.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(res);
          },
        );
        upstream.on("error", () => {
          if (!res.headersSent) res.writeHead(503);
          res.end();
        });
        req.pipe(upstream);
      });
      await new Promise<void>((resolve) =>
        server!.listen(port, "127.0.0.1", resolve),
      );
      port = (server.address() as AddressInfo).port;
    }
    async function stop() {
      if (!server?.listening) return;
      const current = server;
      current.closeAllConnections();
      await new Promise<void>((resolve) => current.close(() => resolve()));
    }
    await start();
    try {
      await use({
        url: `http://127.0.0.1:${port}`,
        mockSync: (handler) => {
          syncHandler = handler;
        },
        offline: async (value) => {
          if (value) await stop();
          else if (!server?.listening) await start();
        },
      });
    } finally {
      await stop();
    }
  },
});
export { expect };
