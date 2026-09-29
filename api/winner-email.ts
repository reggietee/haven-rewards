import type { VercelRequest, VercelResponse } from "../server/http.js";
import { verifyToken } from "../server/auth.js";
import {
  emailConfigured,
  emailSchema,
  SendFailure,
  SendLimiter,
  sendWinnerEmail,
} from "../server/winnerEmail.js";
import { renderWinnerEmail } from "../src/lib/winnerEmail.js";
export const config = { maxDuration: 15 };
const limiter = new SendLimiter();
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  const fail = (code: number, error = "Unable to send this email.") =>
    res.status(code).json({ error });
  if (req.method !== "POST") return fail(405);
  let deadline = false;
  try {
    if (
      !req.headers.origin ||
      new URL(req.headers.origin).host !== req.headers.host ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return fail(403);
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return fail(415);
    if (Buffer.byteLength(JSON.stringify(req.body ?? "")) > 2048)
      return fail(413);
    let deviceId = "";
    try {
      const payload = req.headers.authorization
        ?.replace(/^Bearer /, "")
        .split(".")[0];
      deviceId = JSON.parse(
        Buffer.from(payload ?? "", "base64url").toString(),
      ).deviceId;
    } catch {
      return fail(401);
    }
    if (typeof deviceId !== "string" || !verifyToken(req, deviceId))
      return fail(401);
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return fail(400);
    let rendered;
    try {
      rendered = renderWinnerEmail(parsed.data);
    } catch {
      return fail(400, "That prize is not in the catalogue.");
    }
    // Preview renders the approved template without contacting the provider.
    if (parsed.data.preview)
      return res.status(200).json({
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    if (!emailConfigured())
      return fail(503, "Email sending is not configured on the server.");
    if (!limiter.allow(deviceId)) {
      res.setHeader("Retry-After", "60");
      return fail(429, "Too many sends in a short time. Wait a minute.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      deadline = true;
      controller.abort();
    }, 12000);
    try {
      return res
        .status(200)
        .json(await sendWinnerEmail(parsed.data, controller.signal));
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (res.destroyed || res.writableEnded) return;
    // Fixed diagnostics only: never log winner identities, addresses or credentials.
    console.warn("winner_email_unavailable", {
      reason: deadline
        ? "deadline"
        : error instanceof SendFailure
          ? error.reason
          : "transport",
      status: error instanceof SendFailure ? error.status : undefined,
    });
    return fail(502);
  }
}
