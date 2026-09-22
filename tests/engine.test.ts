import legacyPrizes from "../src/lib/legacy-prizes.json";
import type { Prize } from "../src/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HavenDB } from "../src/lib/db";
import {
  adjustUnit,
  award,
  complete,
  enter,
  generateUnits,
  initialize,
  setup,
  similarNames,
} from "../src/lib/engine";
import {
  CONSENT_TEXT,
  CONSENT_VERSION,
  END,
  PRIZES,
  RULES_VERSION,
  START,
} from "../src/config";
import { csv } from "../src/lib/csv";
import { landingRotation, spinProgress, TAU } from "../src/lib/wheelMath";
let db: HavenDB;
const start = Date.parse(START),
  end = Date.parse(END);
const person = (
  email = "person@example.com",
  first = "Alex",
  last = "Example",
  waitlist = true,
) => ({ first, last, email, age: true, waitlist });
beforeEach(async () => {
  db = new HavenDB("test-" + crypto.randomUUID());
  await setup(db);
  await initialize(db);
});
afterEach(async () => {
  await db.delete();
});
describe("immutable schedule", () => {
  it("updates only untouched, uninitialized legacy defaults and audits the change", async () => {
    const fresh = new HavenDB("migration-" + crypto.randomUUID());
    try {
      await setup(fresh);
      const previous = (legacyPrizes as Prize[]).map((p) =>
        p.id === "passport"
          ? {
              ...p,
              name: "Niagara Passport (Haven + NFIH)",
              quantity: 2,
              tier: 4 as const,
            }
          : p.id === "full-3"
            ? { ...p, value: 507 }
            : p,
      );
      await fresh.device.update("device", {
        configVersion: undefined,
        prizes: previous,
      });
      await setup(fresh);
      expect((await fresh.device.get("device"))?.prizes).toEqual(PRIZES);
      expect((await fresh.audit.toArray()).map((a) => a.action)).toContain(
        "default_configuration_updated",
      );
      const oldSchedule = await initialize(fresh);
      // Seed a previous-release database fixture; production never rewrites this snapshot.
      oldSchedule.prizes = previous;
      oldSchedule.units = generateUnits(previous, oldSchedule.id);
      await fresh.schedules.put(oldSchedule);
      await fresh.units.clear();
      await fresh.units.bulkAdd(oldSchedule.units);
      await fresh.device.update("device", {
        configVersion: "2026-09-21.1",
        prizes: previous,
      });
      expect(oldSchedule.units).toHaveLength(33);
      // An initialized device must retain the exact schedule even across configuration revisions.
      await fresh.device.update("device", { configVersion: undefined });
      await setup(fresh);
      expect(await initialize(fresh)).toEqual(oldSchedule);
      await expect(enter(person(), fresh, start)).rejects.toThrow(
        "review the event configuration",
      );
      expect(await fresh.units.count()).toBe(33);
    } finally {
      await fresh.delete();
    }
  });
  it("upgrades the previous $507 default before initialization, preserving initialized snapshots", async () => {
    const fresh = new HavenDB("value-migration-" + crypto.randomUUID());
    try {
      await setup(fresh);
      const previous = (legacyPrizes as Prize[]).map((p) =>
        p.id === "full-3" ? { ...p, value: 507 } : p,
      );
      await fresh.device.update("device", {
        configVersion: "2026-09-21.2",
        prizes: previous,
      });
      await setup(fresh);
      expect((await fresh.device.get("device"))?.prizes).toEqual(PRIZES);
      expect((await fresh.device.get("device"))?.configVersion).toBe(
        RULES_VERSION,
      );
      expect(await fresh.audit.count()).toBe(1);
      await setup(fresh);
      expect(await fresh.audit.count()).toBe(1);
      const schedule = await initialize(fresh);
      schedule.prizes = previous;
      await fresh.schedules.put(schedule);
      await fresh.device.update("device", {
        configVersion: "2026-09-21.2",
        prizes: previous,
      });
      await setup(fresh);
      expect((await fresh.device.get("device"))?.prizes).toEqual(previous);
      expect(await initialize(fresh)).toEqual(schedule);
    } finally {
      await fresh.delete();
    }
  });
  it("migrates the untouched 34-prize default once, but never changes an initialized schedule", async () => {
    const fresh = new HavenDB("catalogue-migration-" + crypto.randomUUID());
    try {
      await setup(fresh);
      await fresh.device.update("device", {
        configVersion: "2026-09-21.3",
        prizes: legacyPrizes as Prize[],
      });
      await setup(fresh);
      expect((await fresh.device.get("device"))?.prizes).toEqual(PRIZES);
      expect((await fresh.audit.toArray())[0].detail.unitCount).toBe(53);
      await setup(fresh);
      expect(await fresh.audit.count()).toBe(1);
      const schedule = await initialize(fresh);
      schedule.prizes = legacyPrizes as Prize[];
      schedule.units = generateUnits(schedule.prizes, schedule.id);
      await fresh.schedules.put(schedule);
      await fresh.units.clear();
      await fresh.units.bulkAdd(schedule.units);
      await fresh.device.update("device", {
        configVersion: "2026-09-21.3",
        prizes: legacyPrizes as Prize[],
      });
      await setup(fresh);
      expect(await initialize(fresh)).toEqual(schedule);
      expect((await fresh.device.get("device"))?.prizes).toEqual(legacyPrizes);
      expect(await fresh.units.count()).toBe(34);
      expect(await fresh.units.toArray()).toEqual(
        [...schedule.units].sort((a, b) => a.id.localeCompare(b.id)),
      );
      await expect(enter(person(), fresh, start)).rejects.toThrow(
        "review the event configuration",
      );
    } finally {
      await fresh.delete();
    }
  });
  it("does not overwrite operator-customized uninitialized quantities", async () => {
    const fresh = new HavenDB("custom-" + crypto.randomUUID());
    try {
      await setup(fresh);
      const custom = PRIZES.map((p) =>
        p.id === "passport" ? { ...p, quantity: 1 } : p,
      );
      await fresh.device.update("device", {
        configVersion: undefined,
        prizes: custom,
      });
      await setup(fresh);
      expect((await fresh.device.get("device"))?.prizes).toEqual(custom);
      await expect(initialize(fresh)).rejects.toThrow(
        "match the published rules",
      );
    } finally {
      await fresh.delete();
    }
  });
  it("creates exactly 53 unique units, $7,980 and 13/13/13/14 valid release windows", () => {
    const units = generateUnits(PRIZES, crypto.randomUUID());
    expect(units).toHaveLength(53);
    expect(new Set(units.map((u) => u.id)).size).toBe(53);
    expect(PRIZES.reduce((s, p) => s + (p.quantity ?? 0) * p.value, 0)).toBe(
      7980,
    );
    expect(
      [0, 1, 2, 3].map((w) => units.filter((u) => u.window === w).length),
    ).toEqual([13, 13, 13, 14]);
    for (const u of units) {
      expect(Date.parse(u.releaseAt)).toBeGreaterThanOrEqual(
        start + u.window * 3600000,
      );
      expect(Date.parse(u.releaseAt)).toBeLessThan(
        start + (u.window + 1) * 3600000,
      );
    }
  });
  it("survives close/reopen and simultaneous initialization without regeneration", async () => {
    const initial = await db.schedules.toArray();
    const name = db.name;
    db.close();
    db = new HavenDB(name);
    await Promise.all([initialize(db), initialize(db)]);
    expect(await db.schedules.toArray()).toEqual(initial);
    expect(await db.units.count()).toBe(53);
  });
});
describe("entry and award transactions", () => {
  it("falls back before any release and stores a unique prize code", async () => {
    await db.units
      .toCollection()
      .modify({ releaseAt: new Date(start + 1000).toISOString() });
    const e = await enter(person(), db, start);
    const s = await award(e.id, db, start);
    expect(s.prizeId).toBe("day");
    expect(s.code).toMatch(/^HAVEN-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(await db.spins.count()).toBe(1);
  });
  it("blocks normalized duplicate email offline", async () => {
    await enter(person("  ALEX@Example.COM "), db, start);
    await complete(db);
    await expect(enter(person("alex@example.com"), db, start)).rejects.toThrow(
      "already has an entry",
    );
    expect(await db.entries.count()).toBe(1);
  });
  it("flags identical and similar names without blocking", async () => {
    await enter(person("a@b.ca", "Renée", "Smith"), db, start);
    await complete(db);
    const second = await enter(person("b@b.ca", "Renee", "Smith"), db, start);
    expect(second.duplicateName).toBe(true);
    expect(similarNames("alexsmith", "alexsmit")).toBe(true);
    expect(similarNames("alexsmith", "patjones")).toBe(false);
  });
  it("requires new consent and preserves exact proof without changing historical choices", async () => {
    const legacy = {
      id: crypto.randomUUID(),
      entryId: crypto.randomUUID(),
      choice: false,
      text: "Previous consent wording",
      version: "2026-09-21.1",
      source: "Demo Day booth" as const,
      createdAt: new Date(start - 1000).toISOString(),
    };
    await db.consents.add(legacy);
    await expect(
      enter(person("declined@example.com", "Alex", "Test", false), db, start),
    ).rejects.toThrow("Haven.fm email consent");
    expect(await db.entries.count()).toBe(0);
    const e = await enter(person(), db, start);
    expect(
      await db.consents.where("entryId").equals(e.id).first(),
    ).toMatchObject({
      choice: true,
      text: CONSENT_TEXT,
      version: CONSENT_VERSION,
      source: "Demo Day booth",
      createdAt: new Date(start).toISOString(),
    });
    expect(
      CONSENT_TEXT.startsWith("Yes, add me to the Haven.fm waitlist."),
    ).toBe(true);
    expect(await db.consents.get(legacy.id)).toEqual(legacy);
    expect(e.ageAccepted).toBe(true);
    expect(e.rulesVersion).toBe(RULES_VERSION);
  });
  it("reuses committed outcome after concurrent double-taps and reload", async () => {
    const e = await enter(person(), db, end - 1000);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => award(e.id, db, end - 1000)),
    );
    expect(new Set(results.map((s) => s.id)).size).toBe(1);
    expect(await db.spins.count()).toBe(1);
    expect((await db.units.toArray()).filter((u) => u.awardedTo)).toHaveLength(
      1,
    );
    db.close();
    await db.open();
    expect((await award(e.id, db, end - 500)).id).toBe(results[0].id);
  });
  it("carries matured prizes into later windows", async () => {
    await db.units.toCollection().modify({ disabled: true });
    const u = (await db.units.toArray())[0];
    await db.units.update(u.id, {
      disabled: false,
      releaseAt: new Date(start + 100).toISOString(),
    });
    const e = await enter(person(), db, start + 3 * 3600000);
    const s = await award(e.id, db, start + 3 * 3600000);
    expect(s.unitId).toBe(u.id);
  });
  it("disables new entries and spins at exactly 7 p.m.", async () => {
    const e = await enter(person(), db, end - 1000);
    await expect(award(e.id, db, end)).rejects.toThrow("3–7");
    await complete(db);
    await expect(enter(person("late@example.com"), db, end)).rejects.toThrow(
      "3–7",
    );
    expect(await db.spins.count()).toBe(0);
  });
  it("rolls back awards if durable queue writes fail", async () => {
    const e = await enter(person(), db, end - 1000);
    const fail = () => {
      throw new Error("Disk full");
    };
    db.queue.hook("creating", fail);
    await expect(award(e.id, db, end - 1000)).rejects.toThrow("Disk full");
    db.queue.hook("creating").unsubscribe(fail);
    expect(await db.spins.count()).toBe(0);
    expect((await db.units.toArray()).filter((u) => u.awardedTo)).toHaveLength(
      0,
    );
  });
  it("cannot modify awarded units; withdrawing/restoring keeps original release", async () => {
    const e = await enter(person(), db, end - 1000);
    const s = await award(e.id, db, end - 1000);
    await expect(adjustUnit(s.unitId!, true, db)).rejects.toThrow("Awarded");
    const u = (await db.units.toArray()).find((u) => !u.awardedTo)!;
    await adjustUnit(u.id, true, db);
    await adjustUnit(u.id, false, db);
    expect((await db.units.get(u.id))?.releaseAt).toBe(u.releaseAt);
  });
  it("clears active entrant on completion while retaining required records", async () => {
    const e = await enter(person(), db, start);
    await award(e.id, db, start);
    await complete(db);
    expect((await db.device.get("device"))?.activeEntryId).toBeUndefined();
    expect(await db.entries.count()).toBe(1);
    expect((await db.spins.toArray())[0].completedAt).toBeTruthy();
  });
  it("simulates 250 spins across all four hours without over-awards or duplicate outcomes", async () => {
    for (let i = 0; i < 250; i++) {
      const now =
        i < 230
          ? start + Math.floor((i / 230) * (end - start - 1001))
          : end - 1;
      const e = await enter(
        person(`guest${i}@example.com`, `Guest${i}`, "Visitor", true),
        db,
        now,
      );
      await award(e.id, db, now);
      await complete(db);
    }
    const spins = await db.spins.toArray();
    expect(spins).toHaveLength(250);
    expect(new Set(spins.map((s) => s.id)).size).toBe(250);
    expect(new Set(spins.map((s) => s.code)).size).toBe(250);
    const finite = spins.filter((s) => s.unitId);
    expect(finite).toHaveLength(53);
    expect(new Set(finite.map((s) => s.unitId)).size).toBe(53);
    for (const p of PRIZES.filter((p) => p.quantity !== null))
      expect(spins.filter((s) => s.prizeId === p.id).length).toBe(p.quantity);
    expect(spins.filter((s) => s.prizeId === "day")).toHaveLength(197);
  }, 30000);
});
it("escapes commas, quotes, newlines and spreadsheet formula injection in CSV", () => {
  expect(
    csv([{ name: 'A, "B"', note: "two\nlines", formula: '=HYPERLINK("bad")' }]),
  ).toBe(
    '"name","note","formula"\r\n"A, ""B""","two\nlines","\'=HYPERLINK(""bad"")"',
  );
});
it("lands each wheel sector under the fixed top pointer with smooth bounded progression", () => {
  for (let i = 0; i < PRIZES.length; i++)
    expect(landingRotation(i, PRIZES.length) - TAU * 7).toBeCloseTo(
      (i * TAU) / PRIZES.length,
    );
  expect(spinProgress(0)).toBe(0);
  expect(spinProgress(1)).toBe(1);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const p = spinProgress(i / 100);
    expect(p).toBeGreaterThanOrEqual(previous - 1e-10);
    previous = p;
  }
});
