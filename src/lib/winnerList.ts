import { PRIZES } from "../config";
import { findPrize, type Recipient } from "./winnerEmail";
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && body[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((r) => r.some((v) => v.trim()))
    .map((r) =>
      Object.fromEntries(
        header.map((k, i) => [k.trim(), (r[i] ?? "").replace(/^'/, "").trim()]),
      ),
    );
}
const pick = (row: Record<string, string>, ...names: string[]) => {
  for (const name of names) {
    const key = Object.keys(row).find(
      (k) => k.toLowerCase() === name.toLowerCase(),
    );
    if (key && row[key]) return row[key];
  }
  return "";
};
const byName = new Map(PRIZES.map((p) => [p.name.toLowerCase(), p.id]));
const byDisplay = new Map(
  PRIZES.map((p) => [p.displayName.toLowerCase(), p.id]),
);
const prizeIdFor = (row: Record<string, string>) => {
  const id = pick(row, "prizeId", "Prize ID");
  if (id && findPrize(id)) return id;
  const name = pick(row, "Prize Won", "prize_name", "prize");
  return (
    byName.get(name.toLowerCase()) ?? byDisplay.get(name.toLowerCase()) ?? ""
  );
};
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
/** A test copy follows the row on screen first, so it always matches the visible preview. */
export const testRecipient = (
  previewed: Recipient | undefined,
  selected: Recipient[],
  all: Recipient[],
): Recipient | undefined => previewed ?? selected[0] ?? all[0];
export interface ListResult {
  recipients: Recipient[];
  issues: string[];
}
/** Accepts the joined winners export, or the raw Entries and Spins exports together. */
export function buildRecipients(files: string[]): ListResult {
  const tables = files.map(parseCsv).filter((t) => t.length);
  const entries = new Map<string, Record<string, string>>();
  const rows: Record<string, string>[] = [];
  for (const table of tables) {
    const sample = table[0];
    if (pick(sample, "first") && pick(sample, "email") && pick(sample, "id"))
      for (const row of table) entries.set(pick(row, "id"), row);
    else rows.push(...table);
  }
  const issues: string[] = [];
  const recipients: Recipient[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const entry = entries.get(pick(row, "entryId", "Entry ID")) ?? {};
    const email = (pick(row, "Email", "email") || pick(entry, "email"))
      .trim()
      .toLowerCase();
    const name =
      pick(row, "Name") ||
      [pick(entry, "first"), pick(entry, "last")].filter(Boolean).join(" ");
    const prizeId = prizeIdFor(row);
    const code = pick(row, "Prize Code", "code");
    const label = name || email || "a row";
    if (!validEmail(email)) {
      issues.push(`${label}: missing or invalid email address, skipped.`);
      continue;
    }
    if (!name) {
      issues.push(`${email}: no name found, skipped.`);
      continue;
    }
    if (!prizeId) {
      issues.push(
        `${email}: prize could not be matched to the catalogue, skipped.`,
      );
      continue;
    }
    if (!code) {
      issues.push(`${email}: no prize code found, skipped.`);
      continue;
    }
    if (seen.has(email)) {
      issues.push(`${email}: duplicate row, kept the first only.`);
      continue;
    }
    seen.add(email);
    recipients.push({ name, email, prizeId, code });
  }
  if (!recipients.length && !issues.length)
    issues.push("No winner rows were found in these files.");
  return { recipients, issues };
}
