export const EVENT_ID = "nfih-haven-2026-09-22";
export const TIMEZONE = "America/Toronto";
// Entry is open all event day; featured releases retain their immutable 3–7 p.m. schedule.
export const ENTRY_START = "2026-09-22T00:00:00-04:00";
export const START = "2026-09-22T15:00:00-04:00";
export const END = "2026-09-22T19:00:00-04:00";
export const RULES_VERSION = "2026-09-22.4";
export const CONSENT_VERSION = "2026-09-22.1";
export const AGE_TEXT = "I am 18 or older and agree to the official rules.";
export function matchesPublishedPrizes(prizes: Prize[]) {
  return (
    prizes.length === PRIZES.length &&
    PRIZES.every((p) => {
      const saved = prizes.find((q) => q.id === p.id);
      return (
        saved?.name === p.name &&
        saved.quantity === p.quantity &&
        saved.value === p.value
      );
    })
  );
}
export const CONSENT_TEXT =
  "Yes, add me to the Haven.fm waitlist. I agree to receive emails from Haven Workspace about the Haven.fm launch, Haven events, and membership news. You can unsubscribe at any time. Haven Workspace, 242 Mary St, Unit 8, Niagara-on-the-Lake, ON · info@havenworkspace.ca";
export type Tier = 1 | 2 | 3 | 4 | 5;
export type DisplayTier = "platinum" | "gold" | "silver" | "bronze";
export interface Prize {
  displayTier: DisplayTier;
  displayName: string;
  displayOrder: number;
  id: string;
  name: string;
  short: string;
  quantity: number | null;
  value: number;
  approval: string;
  tier: Tier;
  sponsor: "haven" | "nfih" | "zannes" | "storymode";
  claim: string;
}
const havenApproval =
  "Complete Haven’s approval process, including a meeting or tour if requested and the applicable member agreement.";
const passes =
  "Book with Haven for available Tuesdays and Thursdays, 9 a.m.–6 p.m., October 1–December 17, 2026. Advance booking required; unused days expire December 17.";
export const PRIZES: Prize[] = [
  {
    id: "full-3",
    displayTier: "platinum",
    displayName: "3-month Full-Time Haven Membership in NOTL",
    displayOrder: 0,
    name: "3-month Full-Time Haven Membership in NOTL",
    short: "3 MONTHS",
    quantity: 1,
    value: 500,
    approval: "Haven approval",
    tier: 5,
    sponsor: "haven",
    claim: havenApproval,
  },
  {
    id: "passport",
    displayTier: "platinum",
    displayName: "1-Month Niagara Passport Membership",
    displayOrder: 1,
    name: "Niagara Passport Membership, 1 month (Haven + NFIH)",
    short: "PASSPORT",
    quantity: 3,
    value: 400,
    approval: "Haven/NFIH approval",
    tier: 5,
    sponsor: "nfih",
    claim:
      havenApproval +
      " Subject to NFIH’s approval and the provider’s reasonable fulfillment terms supplied to the winner.",
  },
  {
    id: "full-1",
    displayTier: "platinum",
    displayName: "1-month Full-Time Haven Membership in NOTL",
    displayOrder: 3,
    name: "1-month Full-Time Haven Membership in NOTL",
    short: "FULL-TIME",
    quantity: 3,
    value: 169,
    approval: "Haven approval",
    tier: 4,
    sponsor: "haven",
    claim: havenApproval,
  },
  {
    id: "part-1",
    displayTier: "silver",
    displayName: "1-Month Part-Time Membership in NOTL",
    displayOrder: 10,
    name: "1-Month Part-Time Membership in NOTL",
    short: "PART-TIME",
    quantity: 5,
    value: 60,
    approval: "Haven approval",
    tier: 2,
    sponsor: "haven",
    claim: havenApproval,
  },
  {
    id: "address",
    displayTier: "platinum",
    displayName: "6-month NOTL Business Mailing Address",
    displayOrder: 2,
    name: "6-month NOTL Business Mailing Address",
    short: "ADDRESS",
    quantity: 1,
    value: 450,
    approval: "Haven approval, ID and business documents",
    tier: 4,
    sponsor: "haven",
    claim:
      havenApproval +
      " Identification and business documentation are also required.",
  },
  {
    id: "legal-card",
    displayTier: "gold",
    displayName: "Zannes Law Firm Business Legal Services Gift Card",
    displayOrder: 5,
    name: "Zannes Law Firm Business Legal Services Gift Card",
    short: "LEGAL CARD",
    quantity: 5,
    value: 250,
    approval: "Conflict check",
    tier: 3,
    sponsor: "zannes",
    claim:
      "Subject to Zannes Law Firm’s conflict check, service availability and engagement terms. No lawyer-client relationship exists unless the firm confirms it in writing.",
  },
  {
    id: "legal-call",
    displayTier: "gold",
    displayName: "Zannes Law Firm 45-Minute Business Consultation",
    displayOrder: 4,
    name: "Zannes Law Firm 45-minute business consultation",
    short: "CONSULTATION",
    quantity: 3,
    value: 350,
    approval: "Conflict check",
    tier: 4,
    sponsor: "zannes",
    claim:
      "Subject to Zannes Law Firm’s conflict check, service availability and engagement terms. No lawyer-client relationship exists unless the firm confirms it in writing.",
  },
  {
    id: "audit",
    displayTier: "gold",
    displayName: "Story Mode Marketing Audit",
    displayOrder: 6,
    name: "Story Mode marketing audit",
    short: "MARKETING",
    quantity: 5,
    value: 200,
    approval: "",
    tier: 3,
    sponsor: "storymode",
    claim:
      "Story Mode will provide its reasonable fulfillment terms to the winner.",
  },
  {
    id: "office",
    displayTier: "silver",
    displayName: "Private Office for the Day",
    displayOrder: 9,
    name: "Private Office for the Day",
    short: "OFFICE DAY",
    quantity: 2,
    value: 99,
    approval: "",
    tier: 3,
    sponsor: "haven",
    claim:
      "Arrange advance booking with Haven, subject to availability and reasonable fulfillment terms supplied to the winner.",
  },
  {
    id: "bundle",
    displayTier: "bronze",
    displayName: "Haven Event + Coworking Day Bundle",
    displayOrder: 11,
    name: "Haven Event + Coworking Day Bundle",
    short: "EVENT + DAY",
    quantity: 20,
    value: 45,
    approval: "",
    tier: 2,
    sponsor: "haven",
    claim:
      "One Haven event ticket worth up to $20, usable within 12 months subject to availability, plus one $25 coworking day. " +
      passes,
  },
  {
    id: "pack",
    displayTier: "silver",
    displayName: "5-Day Pass Pack",
    displayOrder: 7,
    name: "5-Day Pass Pack",
    short: "5-DAY PACK",
    quantity: 5,
    value: 125,
    approval: "",
    tier: 3,
    sponsor: "haven",
    claim: "Book each of your five days separately. " + passes,
  },
  {
    id: "day",
    displayTier: "bronze",
    displayName: "1-Day Coworking Pass",
    displayOrder: 12,
    name: "1-Day Coworking Pass",
    short: "DAY PASS",
    quantity: null,
    value: 25,
    approval: "",
    tier: 1,
    sponsor: "haven",
    claim: passes,
  },
];
export const CLAIM_TEXT =
  "Your prize is potential until eligibility is verified and you correctly answer Haven’s mathematical skill-testing question. Within 30 calendar days after Haven’s notice, respond, visit Haven if requested, provide required information and complete the question and any approval steps. The name on redemption must match your entry.";
export const currency = (n: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);

// Visual order is independent of catalogue order and never determines odds.
export const WHEEL_PRIZES = [
  "full-3",
  "full-1",
  "part-1",
  "address",
  "legal-card",
  "legal-call",
  "passport",
  "audit",
  "office",
  "bundle",
  "pack",
  "day",
].map((id) => PRIZES.find((prize) => prize.id === id)!);
export const FEATURED_COUNT = PRIZES.reduce(
  (sum, p) => sum + (p.quantity ?? 0),
  0,
);
