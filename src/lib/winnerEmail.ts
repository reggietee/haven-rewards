import { PRIZES, currency, type Prize } from "../config.js";
/** Redemption copy is server-rendered from this table only; senders never supply message bodies.
 * `route` records how a prize could be fulfilled, so automation can replace manual replies later. */
export type Route = "code" | "approval" | "booking" | "partner" | "documents";
interface Redemption {
  route: Route;
  claim: string;
  note?: string;
  link?: { label: string; url: string };
  /** The prize states its own expiry, so the 30-day claim deadline is left off. */
  ownExpiry?: boolean;
  /** Replaces the default dated deadline sentence. */
  deadline?: string;
  /** Fulfilment partner copied on this prize only. Server-side, never client-supplied. */
  cc?: string;
}
const TOUR = {
  label: "Book your tour",
  url: "https://cal.com/havenworkspace/tour",
};
const tourClaim = (period: string, plural = false) =>
  `Pick any time that suits you on our tour calendar and come see the space. We will go through the member agreement while you are here. No payment details are needed, and your ${period} ${plural ? "do" : "does"} not start until the day you first come in to work, so nothing is ticking away while we find a time.`;
/** Three months from the send date. Update alongside CLAIM_DEADLINE before a much later send. */
export const PASS_EXPIRY = "January 8, 2027";
const passWindow = `Coworking days run Monday to Friday, 9 a.m. to 6 p.m., and are good until ${PASS_EXPIRY}. Book each day in advance.`;
export const REDEMPTIONS: Record<string, Redemption> = {
  "full-3": {
    route: "approval",
    claim: tourClaim("three months", true),
    link: TOUR,
  },
  "full-1": {
    route: "approval",
    claim: tourClaim("free month"),
    link: TOUR,
  },
  "part-1": {
    route: "approval",
    claim: tourClaim("free part-time month"),
    link: TOUR,
  },
  address: {
    route: "booking",
    claim:
      "Reply to this email and we will set up a time to sit down and talk through your business and what you need the address for. We will go over the identification and business documents required when we meet.",
  },
  passport: {
    route: "partner",
    claim:
      "Reply to this email. The Passport runs with the Niagara Falls Innovation Hub, and we will coordinate the details with them and come back to you.",
  },
  "legal-card": {
    route: "partner",
    claim:
      "Zannes Law Firm is copied on this email. They run a short conflict check first, then apply your gift card toward business legal services. If you do not need the service within the next 90 days, the prize is transferable to someone else by request.",
    note: "Subject to Zannes Law Firm's conflict check and engagement terms. No lawyer-client relationship exists unless the firm confirms it in writing.",
    deadline:
      "Please let us know within 30 days so we can keep your prize held for you.",
    cc: "hello@zanneslaw.com",
  },
  "legal-call": {
    route: "partner",
    claim:
      "Zannes Law Firm is copied on this email. They run a short conflict check first, then you can book your 45 minutes directly with them. If you do not need the service within the next 90 days, the prize is transferable to someone else by request.",
    note: "Subject to Zannes Law Firm's conflict check and engagement terms. No lawyer-client relationship exists unless the firm confirms it in writing.",
    deadline:
      "Please let us know within 30 days so we can keep your prize held for you.",
    cc: "hello@zanneslaw.com",
  },
  audit: {
    route: "booking",
    claim:
      "Reply to this email and we will set up a time, either at Haven or on a call, whichever suits you better. Story Mode is run by Reggie, our founder, so you will be working with him directly on this one.",
  },
  office: {
    route: "booking",
    claim:
      "Reply with a couple of dates that suit you and we will hold a private office for your day, subject to availability.",
  },
  bundle: {
    route: "booking",
    claim:
      "Your bundle is one coworking day plus free entry to our next Haven event. We will send you the invitation as soon as the next date is set. Reply with the day you would like to come in and we will get you booked.",
    note: passWindow,
    ownExpiry: true,
  },
  pack: {
    route: "booking",
    claim:
      "Thinking of coming in for a full week, or one day a week for five weeks? Send us the dates that suit you and we will lock in a day pass for each of them. Your five days can be used however you like.",
    note: passWindow,
    ownExpiry: true,
  },
  day: {
    route: "booking",
    claim: "Reply with the day you would like to come in.",
    note: passWindow,
    ownExpiry: true,
  },
};
export interface Recipient {
  name: string;
  email: string;
  prizeId: string;
  code: string;
}
export interface Rendered {
  subject: string;
  text: string;
  html: string;
}
export const REPLY_TO = "reggie@havenworkspace.ca";
/** Thirty days from the notice date, per the published rules. Update before a much later send. */
export const CLAIM_DEADLINE = "November 6, 2026";
const LOGO = "https://spin.havenworkspace.ca/brand/haven-logo-2-dk.png";
const deadlineLine = (booked: boolean) =>
  `Please ${booked ? "book" : "let us know"} by ${CLAIM_DEADLINE} so we can keep your prize held for you.`;
const SIGNATURE =
  "The Haven Team\nHaven Workspace\n242 Mary St, Unit 8, Niagara-on-the-Lake, ON";
const FOOTER =
  "You are receiving this because you entered the Haven prize wheel at Demo Day on September 22, 2026. This message is about your prize only.";
export const findPrize = (prizeId: string): Prize | undefined =>
  PRIZES.find((p) => p.id === prizeId);
export const firstName = (name: string) =>
  name.trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
export function renderWinnerEmail(r: Recipient): Rendered {
  const prize = findPrize(r.prizeId);
  const redemption = REDEMPTIONS[r.prizeId];
  if (!prize || !redemption) throw new Error("Unknown prize.");
  const name = firstName(r.name);
  const deadline = redemption.ownExpiry
    ? ""
    : (redemption.deadline ?? deadlineLine(!!redemption.link));
  const subject = `You won the ${prize.displayName} at Haven Demo Day`;
  const lines = [
    `Hi ${name},`,
    "",
    "It was great meeting you at Demo Day at the Niagara Falls Innovation Hub. Thanks for spinning the wheel, and congratulations, you won:",
    "",
    `${prize.displayName} — valued at ${currency(prize.value)}`,
    `Your reference code: ${r.code}`,
    "",
    "How to claim it",
    redemption.claim,
    ...(redemption.link
      ? ["", `${redemption.link.label}: ${redemption.link.url}`]
      : []),
    ...(redemption.note ? ["", redemption.note] : []),
    ...(deadline ? ["", deadline] : []),
    "",
    `If anything is unclear, reply to this email or write to ${REPLY_TO} and Reggie will sort it out with you.`,
    "",
    SIGNATURE,
    "",
    FOOTER,
  ];
  const ink = "#201e2c",
    cream = "#f5f1e8",
    paper = "#efece4",
    card = "#fffdf8",
    gold = "#edc66e",
    muted = "#7d7686";
  const body = (text: string, extra = "") =>
    `<p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:${ink};${extra}">${text}</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${paper};-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Your prize from Demo Day, and how to claim it.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${paper}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%">
<tr><td align="center" style="background:${ink};padding:32px 24px 26px;border-radius:16px 16px 0 0">
<img src="${LOGO}" width="52" height="52" alt="Haven Workspace" style="display:block;border:0;width:52px;height:52px;margin:0 auto 12px">
<div style="font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:${cream};font-weight:600">Haven Workspace</div>
</td></tr>
<tr><td style="background:${card};padding:36px 32px 8px">
<p style="margin:0 0 22px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${muted}">Demo Day · Niagara Falls Innovation Hub</p>
${body(`Hi ${escape(name)},`)}
${body("It was great meeting you at Demo Day at the Niagara Falls Innovation Hub. Thanks for spinning the wheel, and congratulations, you won:")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px"><tr>
<td style="background:${cream};border-left:3px solid ${gold};border-radius:0 10px 10px 0;padding:22px 24px">
<div style="font-size:20px;font-weight:700;line-height:1.3;color:${ink}">${escape(prize.displayName)}</div>
<div style="margin-top:7px;font-size:14px;color:${muted}">Valued at ${escape(currency(prize.value))}</div>
<div style="margin-top:14px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${muted}">Reference code</div>
<div style="margin-top:3px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;color:${ink}">${escape(r.code)}</div>
</td></tr></table>
<p style="margin:0 0 10px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:${muted};font-weight:600">How to claim it</p>
${body(escape(redemption.claim))}
${
  redemption.link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr>
<td style="background:${gold};border-radius:8px"><a href="${redemption.link.url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:${ink};text-decoration:none">${redemption.link.label} &rarr;</a></td>
</tr></table>
<p style="margin:-10px 0 22px;font-size:13px;line-height:1.6;color:${muted}">Or paste this into your browser: <a href="${redemption.link.url}" style="color:${muted}">${redemption.link.url}</a></p>`
    : ""
}
${redemption.note ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:${muted}">${escape(redemption.note)}</p>` : ""}
${deadline ? body(escape(deadline)) : ""}
${body(`If anything is unclear, reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:${ink};text-decoration:underline">${REPLY_TO}</a> and Reggie will sort it out with you.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 0 0;border-top:1px solid #e7e1d6"></td></tr></table>
<p style="margin:20px 0 4px;font-size:16px;line-height:1.6;color:${ink}">The Haven Team</p>
<p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:${muted}">Haven Workspace<br>242 Mary St, Unit 8, Niagara-on-the-Lake, ON</p>
</td></tr>
<tr><td style="background:${card};padding:0 32px 30px;border-radius:0 0 16px 16px">
<p style="margin:0;font-size:12px;line-height:1.65;color:#9b94a3">${escape(FOOTER)}</p>
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text: lines.join("\n"), html };
}
