import legacyPrizes from "./legacy-prizes.json";
import {
  db,
  type HavenDB,
  type Unit,
  type Entry,
  type Spin,
  type Tab,
} from "./db";
import {
  AGE_TEXT,
  CONSENT_TEXT,
  CONSENT_VERSION,
  END,
  EVENT_ID,
  PRIZES,
  FEATURED_COUNT,
  matchesPublishedPrizes,
  RULES_VERSION,
  START,
  TIMEZONE,
  type Prize,
} from "../config";
import { uuid, shuffled, randomInt, prizeCode } from "./random";
export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const nameKey = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function similarNames(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5)
    return false;
  let i = 0,
    j = 0,
    d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++d > 1) return false;
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}
export async function enqueue(
  d: HavenDB,
  tab: Tab,
  record: Record<string, unknown>,
) {
  await d.queue.add({
    id: uuid(),
    tab,
    version: 1,
    record,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    nextAt: 0,
  });
}
export async function audit(
  d: HavenDB,
  action: string,
  detail: Record<string, unknown> = {},
) {
  const row = {
    id: uuid(),
    action,
    createdAt: new Date().toISOString(),
    detail,
  };
  await d.audit.add(row);
  await enqueue(d, "Audit", row);
}
export async function setup(d = db) {
  return d.transaction(
    "rw",
    [d.device, d.schedules, d.audit, d.queue],
    async () => {
      let device = await d.device.get("device");
      if (!device) {
        device = {
          id: "device",
          deviceId: uuid(),
          createdAt: new Date().toISOString(),
          paused: false,
          prizes: structuredClone(PRIZES),
          configVersion: RULES_VERSION,
        };
        await d.device.add(device);
      } else if (!(await d.schedules.count())) {
        // Upgrade only the untouched previous default, never a saved schedule or custom pool.
        const previousDefault = legacyPrizes as Prize[];
        const previousValue = previousDefault.map((p) =>
          p.id === "full-3" ? { ...p, value: 507 } : p,
        );
        const previous = previousValue.map((p) =>
          p.id === "passport"
            ? {
                ...p,
                name: "Niagara Passport (Haven + NFIH)",
                quantity: 2,
                tier: 4 as const,
              }
            : p,
        );
        const definition = (pool: Prize[]) =>
          JSON.stringify(
            pool.map(
              ({
                displayTier: _metal,
                displayName: _name,
                displayOrder: _order,
                ...prize
              }) => prize,
            ),
          );
        const untouchedLegacy =
          !device.configVersion &&
          definition(device.prizes) === definition(previous);
        const untouchedPrevious =
          (device.configVersion === "2026-09-21.2" || !device.configVersion) &&
          definition(device.prizes) === definition(previousValue);
        const untouchedLatest =
          device.configVersion === "2026-09-21.3" &&
          definition(device.prizes) === definition(previousDefault);
        if (untouchedLegacy || untouchedPrevious || untouchedLatest) {
          device.prizes = structuredClone(PRIZES);
          device.configVersion = RULES_VERSION;
          await d.device.put(device);
          await audit(d, "default_configuration_updated", {
            rulesVersion: RULES_VERSION,
            unitCount: FEATURED_COUNT,
          });
        }
      }
      return device;
    },
  );
}
export function generateUnits(prizes: Prize[], scheduleId: string): Unit[] {
  const pool = shuffled(
    prizes.flatMap((p) => Array.from({ length: p.quantity ?? 0 }, () => p.id)),
  );
  const base = Math.floor(pool.length / 4),
    extra = pool.length % 4;
  let index = 0;
  const units: Unit[] = [];
  for (let window = 0; window < 4; window++)
    for (let n = 0; n < base + (window >= 4 - extra ? 1 : 0); n++)
      units.push({
        id: uuid(),
        scheduleId,
        prizeId: pool[index++],
        window,
        releaseAt: new Date(
          Date.parse(START) + window * 3600000 + randomInt(3600000),
        ).toISOString(),
      });
  return units;
}
export async function initialize(d = db) {
  await setup(d);
  return d.transaction(
    "rw",
    [d.device, d.schedules, d.units, d.queue, d.audit],
    async () => {
      const existing = await d.schedules
        .where("eventId")
        .equals(EVENT_ID)
        .first();
      if (existing) return existing;
      const device = (await d.device.get("device"))!;
      if (device.retired) throw new Error("This event is retired.");
      if (!matchesPublishedPrizes(device.prizes))
        throw new Error(
          "Prize configuration must match the published rules before initialization.",
        );
      const id = uuid();
      const units = generateUnits(device.prizes, id);
      const schedule = {
        id,
        eventId: EVENT_ID,
        version: 1 as const,
        createdAt: new Date().toISOString(),
        timezone: TIMEZONE,
        start: START,
        end: END,
        units: structuredClone(units),
        prizes: structuredClone(device.prizes),
        algorithm: "crypto-fisher-yates/rejection-sampling/hourly-v1",
        deviceId: device.deviceId,
      };
      await d.schedules.add(schedule);
      await d.units.bulkAdd(units);
      await enqueue(d, "Inventory", { kind: "schedule", ...schedule });
      await audit(d, "event_initialized", {
        scheduleId: id,
        unitCount: units.length,
      });
      return schedule;
    },
  );
}
function checkState(
  device: { paused: boolean; retired?: boolean; lastClock?: number },
  now: number,
) {
  if (device.retired || device.paused)
    throw new Error("Spins are paused. Please ask booth staff.");
  if (now < Date.parse(START) || now >= Date.parse(END))
    throw new Error("Spins are open September 22, 3–7 p.m. Eastern.");
  if (device.lastClock && now < device.lastClock - 60000)
    throw new Error("Please ask booth staff to check the device clock.");
}
export async function enter(
  input: {
    first: string;
    last: string;
    email: string;
    age: boolean;
    waitlist: boolean;
  },
  d = db,
  now = Date.now(),
): Promise<Entry> {
  const first = input.first.trim(),
    last = input.last.trim(),
    email = normalizeEmail(input.email);
  if (
    !first ||
    !last ||
    first.length > 80 ||
    last.length > 80 ||
    email.length > 254 ||
    !/^\S+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !input.age
  )
    throw new Error("Enter your name, valid email and rules acceptance.");
  return d.transaction(
    "rw",
    [d.device, d.schedules, d.entries, d.consents, d.queue, d.audit],
    async () => {
      const device = (await d.device.get("device"))!;
      checkState(device, now);
      if (!(await d.schedules.count()))
        throw new Error("Please ask booth staff to prepare the wheel.");
      if (!matchesPublishedPrizes(device.prizes))
        throw new Error(
          "Please ask booth staff to review the event configuration.",
        );
      if (await d.entries.where("email").equals(email).count())
        throw new Error(
          "This email already has an entry. One spin per person.",
        );
      if (device.activeEntryId)
        throw new Error("Please finish the current entry first.");
      const key = nameKey(first + last);
      const duplicateName = (await d.entries.toArray()).some((e) =>
        similarNames(e.nameKey, key),
      );
      const createdAt = new Date(now).toISOString();
      const entry: Entry = {
        id: uuid(),
        eventId: EVENT_ID,
        deviceId: device.deviceId,
        first,
        last,
        email,
        nameKey: key,
        duplicateName,
        createdAt,
        rulesVersion: RULES_VERSION,
        ageAccepted: true,
        ageText: AGE_TEXT,
        timezone: TIMEZONE,
      };
      const consent = {
        id: uuid(),
        entryId: entry.id,
        choice: input.waitlist,
        text: CONSENT_TEXT,
        version: CONSENT_VERSION,
        source: "Demo Day booth" as const,
        createdAt,
      };
      await d.entries.add(entry);
      await d.consents.add(consent);
      await enqueue(d, "Entries", { ...entry });
      await enqueue(d, "Consents", consent);
      await d.device.update("device", {
        activeEntryId: entry.id,
        lastClock: now,
      });
      return entry;
    },
  );
}
export async function award(
  entryId: string,
  d = db,
  now = Date.now(),
): Promise<Spin> {
  return d.transaction(
    "rw",
    [d.device, d.schedules, d.entries, d.units, d.spins, d.queue, d.audit],
    async () => {
      const prior = await d.spins.where("entryId").equals(entryId).first();
      if (prior) return prior;
      const device = (await d.device.get("device"))!;
      checkState(device, now);
      if (device.activeEntryId !== entryId || !(await d.entries.get(entryId)))
        throw new Error("Please ask booth staff to check this entry.");
      const schedule = await d.schedules
        .where("eventId")
        .equals(EVENT_ID)
        .first();
      if (!schedule) throw new Error("Event not initialized.");
      if (!matchesPublishedPrizes(schedule.prizes))
        throw new Error(
          "Please ask booth staff to review the event configuration.",
        );
      const available = (await d.units.toArray()).filter(
        (u) => !u.awardedTo && !u.disabled && Date.parse(u.releaseAt) <= now,
      );
      const unit = available.length
        ? available[randomInt(available.length)]
        : undefined;
      const prize = device.prizes.find(
        (p) => p.id === (unit?.prizeId ?? "day"),
      )!;
      let code = prizeCode();
      while (await d.spins.where("code").equals(code).count())
        code = prizeCode();
      const spin: Spin = {
        id: uuid(),
        entryId,
        prizeId: prize.id,
        prize: structuredClone(prize),
        unitId: unit?.id,
        code,
        createdAt: new Date(now).toISOString(),
        scheduleId: schedule.id,
      };
      await d.spins.add(spin);
      if (unit) {
        await d.units.update(unit.id, { awardedTo: spin.id });
        await enqueue(d, "Inventory", {
          ...unit,
          awardedTo: spin.id,
          kind: "award",
          changedAt: spin.createdAt,
        });
      }
      await enqueue(d, "Spins", { ...spin });
      await d.device.update("device", { lastClock: now });
      return spin;
    },
  );
}
export async function complete(d = db) {
  await d.transaction("rw", [d.device, d.spins, d.queue, d.audit], async () => {
    const device = await d.device.get("device");
    if (device?.activeEntryId) {
      const spin = await d.spins
        .where("entryId")
        .equals(device.activeEntryId)
        .first();
      if (spin) {
        const completedAt = new Date().toISOString();
        await d.spins.update(spin.id, { completedAt });
        await audit(d, "result_completed", { spinId: spin.id, completedAt });
      } else
        await audit(d, "entry_abandoned", { entryId: device.activeEntryId });
    }
    await d.device.update("device", { activeEntryId: undefined });
  });
}
export async function pause(paused: boolean, d = db) {
  await d.transaction("rw", [d.device, d.audit, d.queue], async () => {
    await d.device.update("device", { paused });
    await audit(d, paused ? "paused" : "resumed");
  });
}
export async function savePrizes(prizes: Prize[], d = db) {
  await d.transaction(
    "rw",
    [d.device, d.schedules, d.audit, d.queue],
    async () => {
      if (await d.schedules.count())
        throw new Error("Prize configuration is locked.");
      if (prizes.reduce((sum, p) => sum + (p.quantity ?? 0), 0) > 200)
        throw new Error("Keep the featured pool at 200 units or fewer.");
      if (
        prizes.some(
          (p) =>
            p.value < 0 ||
            !Number.isFinite(p.value) ||
            (p.quantity !== null &&
              (!Number.isInteger(p.quantity) ||
                p.quantity < 0 ||
                p.quantity > 200)),
        )
      )
        throw new Error("Check prize values and quantities.");
      await d.device.update("device", { prizes });
      await audit(d, "configuration_updated", { prizes });
    },
  );
}
export async function adjustUnit(id: string, disabled: boolean, d = db) {
  await d.transaction("rw", [d.units, d.audit, d.queue], async () => {
    const unit = await d.units.get(id);
    if (!unit || unit.awardedTo)
      throw new Error("Awarded inventory cannot be changed.");
    await d.units.update(id, { disabled });
    await enqueue(d, "Inventory", {
      ...unit,
      disabled,
      kind: "adjustment",
      changedAt: new Date().toISOString(),
    });
    await audit(d, "inventory_adjusted", { unitId: id, disabled });
  });
}
export async function retire(d = db) {
  await d.transaction(
    "rw",
    [d.device, d.entries, d.consents, d.audit, d.queue],
    async () => {
      if (await d.queue.where("status").equals("pending").count())
        throw new Error("Export and sync all pending records before purging.");
      await d.entries.clear();
      await d.consents.clear();
      await d.device.update("device", {
        retired: true,
        paused: true,
        activeEntryId: undefined,
      });
      const rows = await d.queue.toArray();
      for (const q of rows)
        if (q.tab === "Entries" || q.tab === "Consents")
          await d.queue.update(q.seq!, { record: { purged: true, id: q.id } });
      await audit(d, "event_retired_and_personal_data_purged");
    },
  );
}
