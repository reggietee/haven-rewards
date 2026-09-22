import type { IncomingMessage, ServerResponse } from "node:http";
/** Minimal Node request/response contract supplied by Vercel Functions. */
export interface VercelRequest extends IncomingMessage {
  body: unknown;
}
export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
}
