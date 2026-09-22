import type { VercelRequest, VercelResponse } from "../server/http.js";
import { z } from "zod";
import { issueToken, pinMatches, sameOrigin } from "../server/auth.js";
const attempts = new Map<string, { count: number; until: number }>();
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (!sameOrigin(req))
    return res.status(403).json({ error: "Unable to unlock." });
  if (!process.env.ADMIN_PIN_HASH || !process.env.SESSION_SECRET)
    return res
      .status(503)
      .json({ error: "Operator access is not configured." });
  const ip = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0];
  const attempt = attempts.get(ip);
  if (attempt && attempt.until > Date.now() && attempt.count >= 5) {
    res.setHeader("Retry-After", "300");
    return res.status(429).json({ error: "Please try again later." });
  }
  if (attempts.size > 10000) attempts.clear();
  const parsed = z
    .object({ pin: z.string().regex(/^\d{8,20}$/), deviceId: z.uuid() })
    .strict()
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Unable to unlock." });
  if (!pinMatches(parsed.data.pin)) {
    attempts.set(ip, {
      count: (attempt && attempt.until > Date.now() ? attempt.count : 0) + 1,
      until: Date.now() + 300000,
    });
    return res.status(401).json({ error: "Unable to unlock." });
  }
  if (
    process.env.KIOSK_DEVICE_ID &&
    parsed.data.deviceId !== process.env.KIOSK_DEVICE_ID
  )
    return res.status(403).json({ error: "This device is not paired." });
  attempts.delete(ip);
  return res.status(200).json(issueToken(parsed.data.deviceId));
}
