import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac, scryptSync } from "node:crypto";
import { issueToken, pinMatches, verifyToken } from "../server/auth";
import {
  exclusionMatch,
  rowRange,
  sheetRow,
  syncSchema,
  validateRecords,
  type SyncRecord,
} from "../server/records";
import type { VercelRequest, VercelResponse } from "../server/http";
const request = (token: string) =>
  ({ headers: { authorization: "Bearer " + token } }) as VercelRequest;
afterEach(() => vi.unstubAllEnvs());
it("validates PIN only against server scrypt hash and binds signed grants to device", () => {
  vi.stubEnv(
    "ADMIN_PIN_HASH",
    "salt:" + scryptSync("12345678", "salt", 64).toString("hex"),
  );
  vi.stubEnv("SESSION_SECRET", "unit-test-only-not-a-real-secret");
  expect(pinMatches("12345678")).toBe(true);
  expect(pinMatches("87654321")).toBe(false);
  const { token } = issueToken("device-one");
  expect(verifyToken(request(token), "device-one")).toBe(true);
  expect(verifyToken(request(token), "device-two")).toBe(false);
  expect(verifyToken(request(token + "tamper"), "device-one")).toBe(false);
});
it("rejects expired device grants", () => {
  vi.stubEnv("SESSION_SECRET", "test");
  const payload = Buffer.from(
    JSON.stringify({ deviceId: "d", scope: "haven-kiosk-v1", expires: 0 }),
  ).toString("base64url");
  const token =
    payload +
    "." +
    createHmac("sha256", "test").update(payload).digest("base64url");
  expect(verifyToken(request(token), "d")).toBe(false);
});
const row: SyncRecord = {
  seq: 15,
  id: crypto.randomUUID(),
  version: 1,
  tab: "Entries",
  createdAt: new Date().toISOString(),
  record: {
    id: crypto.randomUUID(),
    first: "A",
    last: "B",
    email: "a@example.com",
    ageAccepted: true,
    rulesVersion: "1",
  },
};
it("uses identical fixed row addresses and payload on retry, never append", () => {
  expect(rowRange(row.tab, row.seq)).toBe("'Entries'!A16:S16");
  expect(sheetRow(row, "device")).toEqual(
    sheetRow(structuredClone(row), "device"),
  );
  expect(sheetRow(row, "device")).toHaveLength(19);
});
it("validates UUIDs, row bounds, consent proof, PII lengths and distinct batch addresses", () => {
  expect(
    syncSchema.safeParse({
      version: 1,
      deviceId: crypto.randomUUID(),
      records: [row],
    }).success,
  ).toBe(true);
  expect(validateRecords([row])).toBe(true);
  expect(validateRecords([row, row])).toBe(false);
  expect(
    syncSchema.safeParse({ version: 1, deviceId: "bad", records: [row] })
      .success,
  ).toBe(false);
  expect(
    validateRecords([
      { ...row, record: { ...row.record, ageAccepted: false } },
    ]),
  ).toBe(false);
});
it("matches restricted excluded records case-insensitively and ignores inactive records", () => {
  const excluded = [["private-id", "A@EXAMPLE.COM", "Other", "Name", "TRUE"]];
  expect(exclusionMatch(row.record, excluded)).toBe(true);
  expect(exclusionMatch(row.record, [["x", "", "A", "B", "true"]])).toBe(true);
  expect(
    exclusionMatch(row.record, [["x", "a@example.com", "A", "B", "false"]]),
  ).toBe(false);
  expect(sheetRow(row, "device").join(" ")).not.toContain("REVIEW");
});
