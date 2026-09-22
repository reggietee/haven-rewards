import { createHmac, timingSafeEqual, scryptSync } from "node:crypto";
import type { VercelRequest } from "./http.js";
export function pinMatches(pin: string) {
  const stored = process.env.ADMIN_PIN_HASH;
  if (!stored) return false;
  const [salt, hex] = stored.split(":");
  if (!salt || !hex || hex.length !== 128) return false;
  const candidate = scryptSync(pin, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hex, "hex"));
}
export function issueToken(deviceId: string) {
  const expires = Date.now() + 7 * 24 * 3600000;
  const payload = Buffer.from(
    JSON.stringify({ deviceId, expires, scope: "haven-kiosk-v1" }),
  ).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(payload)
    .digest("base64url");
  return { token: `${payload}.${signature}`, expires };
}
export function verifyToken(req: VercelRequest, deviceId: string) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const [payload, signature] = token.split(".");
    const expected = createHmac("sha256", process.env.SESSION_SECRET!)
      .update(payload)
      .digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (
      data.deviceId === deviceId &&
      data.expires > Date.now() &&
      data.scope === "haven-kiosk-v1" &&
      (!process.env.KIOSK_DEVICE_ID || process.env.KIOSK_DEVICE_ID === deviceId)
    );
  } catch {
    return false;
  }
}
export function sameOrigin(req: VercelRequest) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
export const sheetsConfigured = () =>
  !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_SHEET_ID &&
    process.env.KIOSK_DEVICE_ID
  );
