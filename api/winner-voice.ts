import type { VercelRequest, VercelResponse } from "../server/http.js";
import { verifyToken } from "../server/auth.js";
import { announcementText, spokenName } from "../src/lib/announcements.js";
import {
  generateVoice,
  voiceConfigured,
  VoiceLimiter,
  VoiceFailure,
  voiceSchema,
} from "../server/winnerVoice.js";
export const config = { maxDuration: 10 };
const limiter = new VoiceLimiter();
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  const fail = (code: number) =>
    res.status(code).json({ error: "Announcement unavailable." });
  if (req.method !== "POST") return fail(405);
  let deadline = false;
  try {
    // Strict browser origin checks plus a PIN-issued signed kiosk token. No cookie-only authorization.
    if (
      !req.headers.origin ||
      new URL(req.headers.origin).host !== req.headers.host ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return fail(403);
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return fail(415);
    if (
      Number(req.headers["content-length"] ?? 0) > 1024 ||
      Buffer.byteLength(JSON.stringify(req.body ?? "")) > 1024
    )
      return fail(413);
    const payload = req.headers.authorization
      ?.replace(/^Bearer /, "")
      .split(".")[0];
    if (!payload) return fail(401);
    const { deviceId } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    if (typeof deviceId !== "string" || !verifyToken(req, deviceId))
      return fail(401);
    const parsed = voiceSchema.safeParse(req.body);
    if (!parsed.success) return fail(400);
    const { entryId, firstName, prizeId } = parsed.data;
    if (!spokenName(firstName) || !announcementText(prizeId, firstName))
      return fail(400);
    if (!voiceConfigured()) return fail(503);
    if (!limiter.reserve(deviceId, entryId)) {
      res.setHeader("Retry-After", "60");
      return fail(429);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      deadline = true;
      controller.abort();
    }, 7500);
    const disconnected = () => controller.abort();
    res.on?.("close", disconnected);
    try {
      return res
        .status(200)
        .json(await generateVoice(firstName, prizeId, controller.signal));
    } finally {
      clearTimeout(timer);
      res.off?.("close", disconnected);
    }
  } catch (error) {
    if (res.destroyed || res.writableEnded) return;
    // Fixed diagnostics only: never log identities, request bodies, credentials or upstream messages.
    console.warn("winner_voice_unavailable", {
      reason: deadline
        ? "deadline"
        : error instanceof VoiceFailure
          ? error.reason
          : "transport",
      status: error instanceof VoiceFailure ? error.status : undefined,
    });
    return fail(503);
  }
}
