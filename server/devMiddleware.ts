import type { IncomingMessage, ServerResponse } from "node:http";
import type { VercelRequest, VercelResponse } from "./http.js";
import admin from "../api/admin.ts";
import health from "../api/health.ts";
import sync from "../api/sync.ts";
export function apiMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  const handler = (
    { "/api/admin": admin, "/api/health": health, "/api/sync": sync } as Record<
      string,
      (req: VercelRequest, res: VercelResponse) => unknown
    >
  )[req.url?.split("?")[0] ?? ""];
  if (!handler) return next();
  let body = "";
  req.on("data", (chunk) => {
    body += String(chunk);
    if (body.length > 200000) {
      res.statusCode = 413;
      res.end();
      req.destroy();
    }
  });
  req.on("end", () => {
    try {
      const request = req as VercelRequest;
      request.body = body ? JSON.parse(body) : {};
      const response = res as unknown as VercelResponse;
      response.status = (n: number) => {
        res.statusCode = n;
        return response;
      };
      response.json = (data: unknown) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
        return response;
      };
      Promise.resolve(handler(request, response)).catch(() => {
        if (!res.writableEnded) {
          res.statusCode = 503;
          res.end('{"error":"Service unavailable."}');
        }
      });
    } catch {
      res.statusCode = 400;
      res.end();
    }
  });
}
