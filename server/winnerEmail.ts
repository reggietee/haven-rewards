import { z } from "zod";
import { renderWinnerEmail, REPLY_TO } from "../src/lib/winnerEmail.js";
export const emailSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.email().max(254),
    prizeId: z.string().max(40),
    code: z.string().regex(/^[A-Za-z0-9-]{4,40}$/),
    preview: z.boolean().optional(),
  })
  .strict();
export function emailConfigured() {
  return !!(
    process.env.RESEND_API_KEY &&
    /^(?:[^<>]{1,80}<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]{2,}>?$/.test(
      process.env.WINNER_EMAIL_FROM ?? "",
    )
  );
}
/** Warm-instance guard. Durable per-winner records live on the operator device. */
export class SendLimiter {
  private devices = new Map<
    string,
    { start: number; minute: number; count: number; total: number }
  >();
  allow(device: string, now = Date.now()): boolean {
    for (const [k, v] of this.devices)
      if (now - v.start >= 86400000) this.devices.delete(k);
    if (this.devices.size >= 20 && !this.devices.has(device)) return false;
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
    if (d.count >= 30 || d.total >= 400) return false;
    d.count++;
    d.total++;
    this.devices.set(device, d);
    return true;
  }
}
export class SendFailure extends Error {
  constructor(
    public reason: "provider_status" | "transport",
    public status?: number,
  ) {
    super(reason);
  }
}
export async function sendWinnerEmail(
  input: z.infer<typeof emailSchema>,
  signal: AbortSignal,
) {
  const { subject, text, html } = renderWinnerEmail(input);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.WINNER_EMAIL_FROM,
      to: [input.email],
      reply_to: process.env.WINNER_EMAIL_REPLY_TO || REPLY_TO,
      subject,
      text,
      html,
    }),
    signal,
  });
  if (!response.ok) throw new SendFailure("provider_status", response.status);
  const body = (await response.json()) as { id?: string };
  return { id: typeof body.id === "string" ? body.id : "", subject };
}
