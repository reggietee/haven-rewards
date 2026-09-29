import { PRIZES, currency, type Prize } from "../config";
/** Redemption copy is server-rendered from this table only; senders never supply message bodies.
 * `route` records how a prize could be fulfilled, so automation can replace manual replies later. */
export type Route = "code" | "approval" | "booking" | "partner" | "documents";
interface Redemption {
  route: Route;
  claim: string;
  note?: string;
}
const passWindow =
  "Coworking days run Tuesdays and Thursdays, 9 a.m.–6 p.m., between October 1 and December 17, 2026. Book each day in advance; unused days expire December 17.";
export const REDEMPTIONS: Record<string, Redemption> = {
  "full-3": {
    route: "approval",
    claim:
      "Reply to this email and we will book a short intro and tour at Haven. Once you are set up, your three months are applied at no charge.",
  },
  "full-1": {
    route: "approval",
    claim:
      "Reply to this email and we will book a short intro and tour at Haven. Once you are set up, your month is applied at no charge.",
  },
  "part-1": {
    route: "approval",
    claim:
      "Reply to this email and we will book a short intro and tour at Haven. Once you are set up, your part-time month is applied at no charge.",
  },
  address: {
    route: "documents",
    claim:
      "Reply to this email with your business name and registration details along with a piece of photo identification. Once those are confirmed, we will set up your Niagara-on-the-Lake mailing address for six months.",
  },
  passport: {
    route: "partner",
    claim:
      "Reply to this email. The Passport runs with the Niagara Falls Innovation Hub, and we will coordinate the details with them and come back to you.",
  },
  "legal-card": {
    route: "partner",
    claim:
      "Reply to this email and we will introduce you to Zannes Law Firm. They run a short conflict check first, then apply your gift card toward business legal services.",
    note: "Subject to Zannes Law Firm's conflict check and engagement terms. No lawyer-client relationship exists unless the firm confirms it in writing.",
  },
  "legal-call": {
    route: "partner",
    claim:
      "Reply to this email and we will introduce you to Zannes Law Firm. They run a short conflict check first, then you can book your 45 minutes directly with them.",
    note: "Subject to Zannes Law Firm's conflict check and engagement terms. No lawyer-client relationship exists unless the firm confirms it in writing.",
  },
  audit: {
    route: "partner",
    claim:
      "Reply to this email and we will introduce you to Story Mode, who will book your marketing audit and send over what they need from you.",
  },
  office: {
    route: "booking",
    claim:
      "Reply with a couple of dates that suit you and we will hold a private office for your day, subject to availability.",
  },
  bundle: {
    route: "booking",
    claim:
      "Your bundle is one ticket to a Haven event, worth up to $20 and good for the next 12 months, plus one coworking day. Reply with the day you would like to come in.",
    note: passWindow,
  },
  pack: {
    route: "booking",
    claim:
      "Reply with the days you would like to book. Your five days can be used separately.",
    note: passWindow,
  },
  day: {
    route: "booking",
    claim: "Reply with the day you would like to come in.",
    note: passWindow,
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
const SIGNATURE =
  "Reggie\nHaven Workspace\n242 Mary St, Unit 8, Niagara-on-the-Lake, ON";
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
    ...(redemption.note ? ["", redemption.note] : []),
    "",
    `If anything is unclear, reply to this email or write to ${REPLY_TO} and I will sort it out with you.`,
    "",
    SIGNATURE,
    "",
    FOOTER,
  ];
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f2;padding:24px 12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#141414">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:32px">
<tr><td>
<p style="margin:0 0 20px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b">Haven Workspace · Demo Day</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">Hi ${escape(name)},</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6">It was great meeting you at Demo Day at the Niagara Falls Innovation Hub. Thanks for spinning the wheel, and congratulations, you won:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:10px;padding:20px;margin:0 0 24px"><tr><td>
<p style="margin:0 0 6px;font-size:19px;font-weight:700;line-height:1.35">${escape(prize.displayName)}</p>
<p style="margin:0 0 10px;font-size:14px;color:#5a5a5a">Valued at ${escape(currency(prize.value))}</p>
<p style="margin:0;font-size:13px;color:#5a5a5a">Your reference code: <strong style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#141414">${escape(r.code)}</strong></p>
</td></tr></table>
<p style="margin:0 0 8px;font-size:16px;font-weight:700">How to claim it</p>
<p style="margin:0 0 ${redemption.note ? "12" : "24"}px;font-size:16px;line-height:1.6">${escape(redemption.claim)}</p>
${redemption.note ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5a5a5a">${escape(redemption.note)}</p>` : ""}
<p style="margin:0 0 24px;font-size:16px;line-height:1.6">If anything is unclear, reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:#141414">${REPLY_TO}</a> and I will sort it out with you.</p>
<p style="margin:0 0 4px;font-size:16px;line-height:1.6">Reggie<br>Haven Workspace</p>
<p style="margin:0 0 24px;font-size:14px;color:#5a5a5a">242 Mary St, Unit 8, Niagara-on-the-Lake, ON</p>
<p style="margin:0;padding-top:20px;border-top:1px solid #e6e6e2;font-size:12px;line-height:1.6;color:#8a8a8a">${escape(FOOTER)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text: lines.join("\n"), html };
}
