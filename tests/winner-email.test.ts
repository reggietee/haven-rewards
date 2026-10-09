import { describe, expect, it } from "vitest";
import { PRIZES } from "../src/config";
import {
  CLAIM_WINDOW,
  PASS_EXPIRY,
  REDEMPTIONS,
  REPLY_TO,
  firstName,
  renderWinnerEmail,
  type Recipient,
} from "../src/lib/winnerEmail";
import {
  buildRecipients,
  parseCsv,
  testRecipient,
} from "../src/lib/winnerList";
const base = {
  name: "Dana Okafor",
  email: "dana@example.com",
  code: "HAVEN-TEST-01",
};
describe("winner email template", () => {
  it("covers every catalogue prize", () => {
    for (const prize of PRIZES) expect(REDEMPTIONS[prize.id]).toBeTruthy();
  });
  it("renders each prize with its name, value, code and reply address", () => {
    for (const prize of PRIZES) {
      const mail = renderWinnerEmail({ ...base, prizeId: prize.id });
      expect(mail.subject).toContain(prize.displayName);
      for (const part of [mail.text, mail.html]) {
        expect(part).toContain(prize.displayName);
        expect(part).toContain(base.code);
        expect(part).toContain(REPLY_TO);
      }
      expect(mail.text).toContain("Hi Dana,");
      expect(mail.text).toContain(REDEMPTIONS[prize.id].claim);
    }
  });
  it("states the claim deadline on prizes that do not carry their own expiry", () => {
    for (const prize of PRIZES) {
      const mail = renderWinnerEmail({ ...base, prizeId: prize.id });
      const expected = !REDEMPTIONS[prize.id].ownExpiry;
      expect(mail.text.includes(CLAIM_WINDOW)).toBe(expected);
      expect(mail.html.includes(CLAIM_WINDOW)).toBe(expected);
    }
  });
  it("replaces the deadline with the usage window on pass prizes", () => {
    for (const id of ["pack", "bundle", "day"]) {
      const mail = renderWinnerEmail({ ...base, prizeId: id });
      expect(mail.text).toContain(PASS_EXPIRY);
      expect(mail.text).not.toContain(CLAIM_WINDOW);
      expect(mail.text).not.toContain("keep your prize held");
    }
  });
  it("shows the logo over https with alt text, and keeps the text copy image-free", () => {
    const mail = renderWinnerEmail({ ...base, prizeId: "bundle" });
    expect(mail.html).toContain(
      'src="https://spin.havenworkspace.ca/brand/haven-logo-2-dk.png"',
    );
    expect(mail.html).toContain('alt="Haven Workspace"');
    expect(mail.text).not.toContain("http");
  });
  it("sends membership winners to the tour calendar in both formats", () => {
    const url = "https://cal.com/havenworkspace/tour";
    for (const id of ["full-3", "full-1", "part-1"]) {
      const mail = renderWinnerEmail({ ...base, prizeId: id });
      expect(mail.text).toContain(`Book your tour: ${url}`);
      expect(mail.html).toContain(`href="${url}"`);
      expect(mail.text).not.toContain("couple of times");
    }
  });
  it("leaves every other prize without a booking link", () => {
    for (const prize of PRIZES) {
      if (REDEMPTIONS[prize.id].link) continue;
      expect(
        renderWinnerEmail({ ...base, prizeId: prize.id }).text,
      ).not.toContain("http");
    }
  });
  it("tells membership winners no payment details are needed", () => {
    for (const id of ["full-3", "full-1", "part-1"]) {
      const mail = renderWinnerEmail({ ...base, prizeId: id });
      expect(mail.text).toContain("No payment details are needed");
      expect(mail.text).toContain("member agreement");
    }
  });
  it("rejects a prize that is not in the catalogue", () => {
    expect(() => renderWinnerEmail({ ...base, prizeId: "made-up" })).toThrow();
  });
  it("escapes html in supplied values and keeps the text copy plain", () => {
    const mail = renderWinnerEmail({
      ...base,
      name: "<script>alert(1)</script> Riley",
      prizeId: "bundle",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(firstName("  Riley  Chen ")).toBe("Riley");
  });
  it("adds the booking window only to pass-based prizes", () => {
    for (const id of ["pack", "bundle", "day"]) {
      const text = renderWinnerEmail({ ...base, prizeId: id }).text;
      expect(text).toContain("Monday to Friday");
      expect(text).toContain(PASS_EXPIRY);
    }
    for (const id of ["full-3", "address", "audit", "legal-call"])
      expect(renderWinnerEmail({ ...base, prizeId: id }).text).not.toContain(
        PASS_EXPIRY,
      );
  });
  it("offers the Zannes prizes on a relative clock, transferable, no fixed date", () => {
    for (const id of ["legal-card", "legal-call"]) {
      const mail = renderWinnerEmail({ ...base, prizeId: id });
      expect(mail.text).toContain("within 30 days");
      expect(mail.text).toContain("transferable to someone else by request");
      expect(mail.text).toContain("next 90 days");
    }
  });
  it("copies the law firm on the Zannes prizes and nothing else", () => {
    expect(REDEMPTIONS["legal-card"].cc).toBe("hello@zanneslaw.com");
    expect(REDEMPTIONS["legal-call"].cc).toBe("hello@zanneslaw.com");
    for (const prize of PRIZES)
      if (!prize.id.startsWith("legal-"))
        expect(REDEMPTIONS[prize.id].cc).toBeUndefined();
  });
  it("speaks for Haven, with Reggie as the fallback contact", () => {
    for (const prize of PRIZES) {
      const mail = renderWinnerEmail({ ...base, prizeId: prize.id });
      expect(mail.text).toContain("The Haven Team");
      expect(mail.text).toContain(`${REPLY_TO} and Reggie will sort it out`);
      expect(mail.text).not.toMatch(/\bI will\b/);
      expect(mail.text).not.toMatch(/\bmy own\b/);
    }
  });
  it("keeps Story Mode in-house rather than offering an introduction", () => {
    const text = renderWinnerEmail({ ...base, prizeId: "audit" }).text;
    expect(text).toContain("Story Mode is run by Reggie, our founder");
    expect(text).not.toContain("introduce you");
  });
});
const joined = `﻿"Name","Email","Prize Won","Prize Tier","Prize Code"
"Dana Okafor","Dana@Example.com ","Haven Event + Coworking Day Bundle","Bronze","HAVEN-AAA-01"
"Sam Lee","sam@example.com","5-Day Pass Pack","Silver","HAVEN-BBB-02"`;
const entriesCsv = `"id","email","first","last"
"e1","dana@example.com","Dana","Okafor"
"e2","sam@example.com","Sam","Lee"`;
const spinsCsv = `"id","entryId","prizeId","code"
"s1","e1","bundle","HAVEN-AAA-01"
"s2","e2","pack","HAVEN-BBB-02"`;
describe("test copy recipient", () => {
  const a: Recipient = {
    name: "A",
    email: "a@e.com",
    prizeId: "bundle",
    code: "HAVEN-A-1",
  };
  const b: Recipient = {
    name: "B",
    email: "b@e.com",
    prizeId: "pack",
    code: "HAVEN-B-2",
  };
  const c: Recipient = {
    name: "C",
    email: "c@e.com",
    prizeId: "full-1",
    code: "HAVEN-C-3",
  };
  it("follows the previewed row ahead of the selection and the list", () => {
    expect(testRecipient(c, [b], [a, b, c])).toBe(c);
  });
  it("falls back to the first selected row, then the first loaded row", () => {
    expect(testRecipient(undefined, [b], [a, b, c])).toBe(b);
    expect(testRecipient(undefined, [], [a, b, c])).toBe(a);
    expect(testRecipient(undefined, [], [])).toBeUndefined();
  });
});
describe("winner list", () => {
  it("parses quoted csv with a byte order mark", () => {
    const rows = parseCsv(joined);
    expect(rows).toHaveLength(2);
    expect(rows[0].Name).toBe("Dana Okafor");
  });
  it("builds recipients from the joined export", () => {
    const { recipients, issues } = buildRecipients([joined]);
    expect(issues).toEqual([]);
    expect(recipients).toEqual([
      {
        name: "Dana Okafor",
        email: "dana@example.com",
        prizeId: "bundle",
        code: "HAVEN-AAA-01",
      },
      {
        name: "Sam Lee",
        email: "sam@example.com",
        prizeId: "pack",
        code: "HAVEN-BBB-02",
      },
    ]);
  });
  it("joins the raw entries and spins exports in either order", () => {
    const a = buildRecipients([entriesCsv, spinsCsv]).recipients;
    const b = buildRecipients([spinsCsv, entriesCsv]).recipients;
    expect(a).toEqual(b);
    expect(a).toEqual(buildRecipients([joined]).recipients);
  });
  it("reports bad rows instead of emailing them", () => {
    const bad = `"Name","Email","Prize Won","Prize Code"
"No Mail","","5-Day Pass Pack","HAVEN-CCC-03"
"Unknown Prize","x@example.com","Mystery Box","HAVEN-DDD-04"
"No Code","y@example.com","5-Day Pass Pack",""
"Dupe One","dupe@example.com","5-Day Pass Pack","HAVEN-EEE-05"
"Dupe Two","DUPE@example.com","5-Day Pass Pack","HAVEN-FFF-06"`;
    const { recipients, issues } = buildRecipients([bad]);
    expect(recipients.map((r) => r.email)).toEqual(["dupe@example.com"]);
    expect(issues).toHaveLength(4);
    expect(issues.some((i) => i.includes("duplicate"))).toBe(true);
  });
});
