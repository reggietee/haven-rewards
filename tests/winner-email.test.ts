import { describe, expect, it } from "vitest";
import { PRIZES } from "../src/config";
import {
  CLAIM_DEADLINE,
  REDEMPTIONS,
  REPLY_TO,
  firstName,
  renderWinnerEmail,
} from "../src/lib/winnerEmail";
import { buildRecipients, parseCsv } from "../src/lib/winnerList";
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
  it("states the claim deadline on every prize, in both formats", () => {
    for (const prize of PRIZES) {
      const mail = renderWinnerEmail({ ...base, prizeId: prize.id });
      expect(mail.text).toContain(CLAIM_DEADLINE);
      expect(mail.html).toContain(CLAIM_DEADLINE);
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
    expect(renderWinnerEmail({ ...base, prizeId: "pack" }).text).toContain(
      "December 17",
    );
    expect(
      renderWinnerEmail({ ...base, prizeId: "full-3" }).text,
    ).not.toContain("December 17");
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
