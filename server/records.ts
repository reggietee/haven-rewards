import { z } from "zod";
const scalar = z.union([
  z.string().max(48000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const record = z
  .record(z.string().max(80), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 48000);
export const syncSchema = z
  .object({
    version: z.literal(1),
    deviceId: z.uuid(),
    records: z
      .array(
        z.object({
          seq: z.number().int().min(1).max(9998),
          id: z.uuid(),
          version: z.literal(1),
          tab: z.enum(["Entries", "Consents", "Spins", "Inventory", "Audit"]),
          createdAt: z.iso.datetime(),
          record,
        }),
      )
      .min(1)
      .max(12),
  })
  .strict();
export type SyncRecord = z.infer<typeof syncSchema>["records"][number];
export const HEADERS = [
  "record_uuid",
  "version",
  "device_id",
  "recorded_at",
  "entity_id",
  "entry_id",
  "first_name",
  "last_name",
  "email",
  "waitlist_choice",
  "consent_text",
  "consent_version",
  "consent_source",
  "prize_name",
  "prize_code",
  "unit_id",
  "rules_version",
  "duplicate_name",
  "payload_json",
];
export function sheetRow(q: SyncRecord, deviceId: string) {
  const r = q.record;
  return [
    q.id,
    q.version,
    deviceId,
    q.createdAt,
    r.id ?? "",
    r.entryId ?? "",
    r.first ?? "",
    r.last ?? "",
    r.email ?? "",
    r.choice ?? "",
    r.text ?? "",
    r.version ?? "",
    r.source ?? "",
    (r.prize as Record<string, unknown> | undefined)?.name ?? "",
    r.code ?? "",
    r.unitId ?? "",
    r.rulesVersion ?? "",
    r.duplicateName ?? "",
    JSON.stringify(r),
  ].map((v) =>
    typeof v === "string" || typeof v === "number" || typeof v === "boolean"
      ? v
      : JSON.stringify(v),
  );
}
export function rowRange(tab: string, seq: number) {
  return `'${tab}'!A${seq + 1}:S${seq + 1}`;
}
export function validateRecords(records: SyncRecord[]) {
  const ids = new Set<string>(),
    seqs = new Set<number>();
  for (const q of records) {
    if (ids.has(q.id) || seqs.has(q.seq)) return false;
    ids.add(q.id);
    seqs.add(q.seq);
    if (q.tab === "Entries") {
      const e = z
        .object({
          id: z.uuid(),
          first: z.string().trim().min(1).max(80),
          last: z.string().trim().min(1).max(80),
          email: z.email().max(254),
          ageAccepted: z.literal(true),
          rulesVersion: z.string().min(1),
        })
        .safeParse(q.record);
      if (!e.success) return false;
    }
    if (q.tab === "Consents") {
      if (
        !z
          .object({
            id: z.uuid(),
            entryId: z.uuid(),
            choice: z.boolean(),
            text: z.string().min(1).max(2000),
            version: z.string().min(1),
            source: z.literal("Demo Day booth"),
            createdAt: z.iso.datetime(),
          })
          .safeParse(q.record).success
      )
        return false;
    }
    if (q.tab === "Spins") {
      if (
        !z
          .object({
            id: z.uuid(),
            entryId: z.uuid(),
            prizeId: z.string().min(1),
            code: z.string().regex(/^HAVEN-[A-Z2-9]{4}-[A-Z2-9]{4}$/),
            scheduleId: z.uuid(),
          })
          .safeParse(q.record).success
      )
        return false;
    }
    for (const value of Object.values(q.record))
      if (typeof value !== "object" && !scalar.safeParse(value).success)
        return false;
  }
  return true;
}
export function exclusionMatch(
  entry: Record<string, unknown>,
  rows: string[][],
) {
  const norm = (s: unknown) =>
    String(s ?? "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  return rows
    .filter((row) => row[4]?.toLowerCase() === "true")
    .some(
      (row) =>
        (row[1] &&
          row[1].trim().toLowerCase() ===
            String(entry.email).trim().toLowerCase()) ||
        (row[2] &&
          row[3] &&
          norm(row[2]) === norm(entry.first) &&
          norm(row[3]) === norm(entry.last)),
    );
}
