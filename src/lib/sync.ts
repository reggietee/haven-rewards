import {
  sealAuthorization,
  supportsOfflineUnlock,
  unlockAuthorization,
} from "./operator";
import { db } from "./db";
export type Readiness = {
  configured: boolean;
  adminConfigured: boolean;
  voiceConfigured?: boolean;
};
export async function getReadiness(): Promise<Readiness> {
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    if (!r.ok) throw 0;
    return await r.json();
  } catch {
    return { configured: false, adminConfigured: false };
  }
}
let running = false;
export async function syncNow(force = false) {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const device = await db.device.get("device");
    if (!device?.auth) return;
    const rows = (await db.queue.where("status").equals("pending").toArray())
      .filter((q) => force || q.nextAt <= Date.now())
      .slice(0, 12);
    if (!rows.length) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${device.auth}`,
        },
        body: JSON.stringify({
          version: 1,
          deviceId: device.deviceId,
          records: rows.map((q) => ({
            seq: q.seq,
            id: q.id,
            tab: q.tab,
            version: q.version,
            record: q.record,
            createdAt: q.createdAt,
          })),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw 0;
      const { accepted } = (await res.json()) as { accepted: string[] };
      if (!Array.isArray(accepted)) throw 0;
      const now = new Date().toISOString();
      await db.transaction("rw", [db.queue, db.device], async () => {
        for (const row of rows)
          if (accepted.includes(row.id))
            await db.queue.update(row.seq!, {
              status: "synced",
              syncedAt: now,
            });
        await db.device.update("device", { lastSync: now });
      });
    } catch {
      await db.transaction("rw", db.queue, async () => {
        for (const row of rows)
          await db.queue.update(row.seq!, {
            attempts: row.attempts + 1,
            nextAt:
              Date.now() +
              Math.min(300000, 2000 * 2 ** Math.min(row.attempts, 7)),
          });
      });
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    running = false;
  }
}
export function startSync() {
  const run = () => void syncNow();
  const foreground = () => {
    if (!document.hidden) run();
  };
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", foreground);
  const timer = setInterval(run, 10000);
  run();
  return () => {
    clearInterval(timer);
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", foreground);
  };
}
export async function login(pin: string) {
  const device = (await db.device.get("device"))!;
  let response: Response | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    response = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, deviceId: device.deviceId }),
      signal: controller.signal,
    });
  } catch {
    /* An already-authorized kiosk can verify its PIN offline below. */
  } finally {
    clearTimeout(timer);
  }
  if (response?.ok) {
    const { token, expires } = await response.json();
    const operatorLock = supportsOfflineUnlock()
      ? await sealAuthorization(token, pin)
      : undefined;
    await db.device.update("device", {
      auth: token,
      authExpires: expires,
      operatorLock,
    });
    return;
  }
  if (
    (!response || response.status === 503) &&
    supportsOfflineUnlock() &&
    device.auth &&
    device.authExpires &&
    device.authExpires > Date.now() &&
    device.operatorLock &&
    (await unlockAuthorization(device.operatorLock, pin, device.auth))
  )
    return;
  throw new Error("Unable to unlock. Check your PIN and connection.");
}
