import { createHmac } from "node:crypto";
import { z } from "zod";
import { announcementText, spokenName } from "../src/lib/announcements.js";
export const voiceSchema = z
  .object({
    entryId: z.uuid(),
    firstName: z.string().max(160),
    prizeId: z.string().max(40),
  })
  .strict();
export function voiceConfigured() {
  return !!(
    process.env.ELEVENLABS_API_KEY &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(process.env.ELEVENLABS_VOICE_ID ?? "")
  );
}
/** Warm-instance abuse protection; durable kiosk attempt markers enforce one request per entrant. */
export class VoiceLimiter {
  private devices = new Map<
    string,
    { start: number; minute: number; count: number; total: number }
  >();
  private attempts = new Map<string, number>();
  reserve(device: string, entry: string, now = Date.now()): boolean {
    for (const [k, expires] of this.attempts)
      if (expires <= now) this.attempts.delete(k);
    for (const [k, v] of this.devices)
      if (now - v.start >= 86400000) this.devices.delete(k);
    const key = createHmac("sha256", process.env.SESSION_SECRET!)
      .update(device + ":" + entry)
      .digest("hex");
    if (
      this.attempts.has(key) ||
      this.attempts.size >= 2000 ||
      (this.devices.size >= 20 && !this.devices.has(device))
    )
      return false;
    const d = this.devices.get(device) ?? {
      start: now,
      minute: now,
      count: 0,
      total: 0,
    };
    if (now - d.minute >= 60000) {
      d.minute = now;
      d.count = 0;
    }
    if (d.count >= 6 || d.total >= 300) return false;
    d.count++;
    d.total++;
    this.devices.set(device, d);
    this.attempts.set(key, now + 86400000);
    return true;
  }
}
export async function generateVoice(
  firstName: string,
  prizeId: string,
  signal: AbortSignal,
) {
  const name = spokenName(firstName);
  const text = name && announcementText(prizeId, name);
  if (!text || !voiceConfigured()) throw new Error("unavailable");
  const url = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID!)}`,
  );
  url.searchParams.set("output_format", "mp3_44100_128");
  if (process.env.ELEVENLABS_ZERO_RETENTION === "true")
    url.searchParams.set("enable_logging", "false");
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
      language_code: "en",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
        speed: 1.05,
      },
    }),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("audio/mpeg") ||
    Number(response.headers.get("content-length")) > 512000
  ) {
    await response.body?.cancel();
    throw new Error("unavailable");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512000) throw new Error("unavailable");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const audio = Buffer.concat(chunks);
  if (
    audio.length < 100 ||
    !(
      audio.subarray(0, 3).toString() === "ID3" ||
      (audio[0] === 255 && (audio[1] & 224) === 224)
    )
  )
    throw new Error("unavailable");
  return {
    text,
    audioBase64: audio.toString("base64"),
    mimeType: "audio/mpeg",
  };
}
