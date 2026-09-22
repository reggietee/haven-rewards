import { PRIZES } from "../config.js";
/** Approved speech copy, keyed only by canonical catalogue IDs. No client text is authoritative. */
export const ANNOUNCEMENTS: Record<string, string> = {
  "full-3":
    "{firstName}! This is huge. You’ve just won the grand prize: a three-month full-time Haven Workspace membership in Niagara-on-the-Lake! Congratulations!",
  passport:
    "{firstName}! Congratulations! You’ve won a one-month Niagara Passport membership—one of today’s grand prizes!",
  address:
    "Congratulations, {firstName}! You’ve won a six-month Haven business mailing address in Niagara-on-the-Lake!",
  "full-1":
    "Congratulations, {firstName}! You’ve won a one-month full-time Haven Workspace membership in Niagara-on-the-Lake!",
  "legal-call":
    "Congratulations, {firstName}! You’ve won a forty-five-minute business consultation with Zannes Law Firm!",
  "legal-card":
    "Congratulations, {firstName}! You’ve won a Business Legal Services Gift Card from Zannes Law Firm!",
  audit:
    "Congratulations, {firstName}! You’ve won a Story Mode marketing audit!",
  pack: "Congratulations, {firstName}! You’ve won a five-day coworking pass pack at Haven!",
  office:
    "Congratulations, {firstName}! You’ve won a private office for the day at Haven!",
  "part-1":
    "Congratulations, {firstName}! You’ve won a one-month part-time Haven Workspace membership in Niagara-on-the-Lake!",
  bundle:
    "Congratulations, {firstName}! You’ve won a Haven event and coworking day bundle!",
  day: "Congratulations, {firstName}! You’ve won a coworking day at Haven. We can’t wait to welcome you!",
};
export const VOICE_PRIVACY =
  "If sound is enabled, the attendee’s first name may be securely sent to our voice-service provider solely to generate a spoken prize announcement. Email addresses are never sent for this purpose.";
/** Conservative speech eligibility; invalid names still enter the contest normally. */
export function spokenName(input: unknown): string | undefined {
  if (typeof input !== "string" || input.length > 160) return;
  const name = input
    .normalize("NFC")
    .replace(/[‐‑]/g, "-")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .replace(/\s+/gu, " ");
  if (!name || [...name].length > 40 || name.split(" ").length > 3) return;
  if (
    !/^\p{L}[\p{L}\p{M}]*(?:[ '\u2019\u02bc\-]\p{L}[\p{L}\p{M}]*)*$/u.test(name)
  )
    return;
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[ '\u2019\u02bc\-]+/u);
  if (
    words.some((w) =>
      /^(ignore|instructions?|prompt|system|assistant|announce|speak|say|repeat|password|subscribe|congratulations|fuck\w*|shit\w*|asshole|bitch|cunt|nigger|nigga)$/.test(
        w,
      ),
    )
  )
    return;
  return name;
}
export function announcementText(
  prizeId: string,
  firstName?: string,
): string | undefined {
  if (!PRIZES.some((p) => p.id === prizeId)) return;
  const template = ANNOUNCEMENTS[prizeId];
  if (!template) return;
  const name = spokenName(firstName);
  return name
    ? template.replace("{firstName}", name)
    : template
        .replace("Congratulations, {firstName}!", "Congratulations!")
        .replace("{firstName}! Congratulations!", "Congratulations!")
        .replace("{firstName}!", "Congratulations!");
}
