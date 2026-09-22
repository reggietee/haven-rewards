import { db, type Tab } from "./db";
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const escape = (v: unknown) => {
    let s =
      v === undefined || v === null
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return [
    keys.map(escape).join(","),
    ...rows.map((row) => keys.map((k) => escape(row[k])).join(",")),
  ].join("\r\n");
}
export async function exportCsv(tab: Tab) {
  const rows = await db.queue
    .where("status")
    .anyOf("pending", "synced")
    .toArray();
  const entries = tab === "Consents" ? await db.entries.toArray() : [];
  const data = rows
    .filter((q) => q.tab === tab)
    .map((q) => ({
      ...q.record,
      ...(tab === "Consents"
        ? { email: entries.find((e) => e.id === q.record.entryId)?.email ?? "" }
        : {}),
      recordUuid: q.id,
      rowSequence: q.seq,
      syncStatus: q.status,
      syncAttempts: q.attempts,
      syncedAt: q.syncedAt,
    }));
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv(data)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `haven-${tab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
