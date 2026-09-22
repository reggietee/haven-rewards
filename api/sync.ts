import type { VercelRequest, VercelResponse } from "../server/http.js";
import { JWT } from "google-auth-library";
import { sameOrigin, sheetsConfigured, verifyToken } from "../server/auth.js";
import {
  exclusionMatch,
  rowRange,
  sheetRow,
  syncSchema,
  validateRecords,
} from "../server/records.js";
export const config = { maxDuration: 30 };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (!sameOrigin(req))
    return res.status(403).json({ error: "Request unavailable." });
  if (
    Number(req.headers["content-length"] ?? 0) > 200000 ||
    JSON.stringify(req.body ?? "").length > 200000
  )
    return res.status(413).end();
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success || !validateRecords(parsed.data.records))
    return res.status(400).json({ error: "Invalid records." });
  const { deviceId, records } = parsed.data;
  if (!verifyToken(req, deviceId))
    return res.status(401).json({ error: "Device authorization required." });
  if (!sheetsConfigured())
    return res.status(503).json({ error: "Local records retained." });
  try {
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEET_ID!)}`;
    // Fixed, device-owned row addresses make retries/concurrent identical requests idempotent.
    const existing = await auth.request<{
      valueRanges: { values?: string[][] }[];
    }>({
      url: base + "/values:batchGet",
      params: {
        ranges: records.map((q) => `'${q.tab}'!A${q.seq + 1}:C${q.seq + 1}`),
      },
    });
    for (let i = 0; i < records.length; i++) {
      const row = existing.data.valueRanges[i]?.values?.[0];
      if (row?.[0] && (row[0] !== records[i].id || row[2] !== deviceId))
        return res
          .status(409)
          .json({ error: "Row ownership conflict. Local records retained." });
    }
    // Read restricted data on every batch containing entries. Fail closed for syncing if inaccessible.
    const fresh = records.filter(
      (_, index) => !existing.data.valueRanges[index]?.values?.[0]?.[0],
    );
    if (!fresh.length)
      return res.status(200).json({ accepted: records.map((q) => q.id) });
    const entries = fresh.filter((q) => q.tab === "Entries");
    let excluded: string[][] = [];
    if (entries.length) {
      const result = await auth.request<{ values?: string[][] }>({
        url: base + "/values/" + encodeURIComponent("'Excluded'!A2:E10000"),
      });
      excluded = result.data.values ?? [];
    }
    const data = fresh.map((q) => ({
      range: rowRange(q.tab, q.seq),
      values: [sheetRow(q, deviceId)],
    }));
    for (const q of entries) {
      data.push({
        range: `'Excluded'!G${q.seq + 1}:L${q.seq + 1}`,
        values: [
          [
            q.id,
            deviceId,
            String(q.record.id),
            exclusionMatch(q.record, excluded) ? "REVIEW" : "",
            q.createdAt,
            "Review only; no kiosk behavior change",
          ],
        ],
      });
    }
    await auth.request({
      url: base + "/values:batchUpdate",
      method: "POST",
      data: { valueInputOption: "RAW", data },
    });
    return res.status(200).json({ accepted: records.map((q) => q.id) });
  } catch {
    return res
      .status(503)
      .json({ error: "Sync unavailable. Local records retained." });
  }
}
