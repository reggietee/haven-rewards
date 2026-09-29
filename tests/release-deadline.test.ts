import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIZES } from "../src/config";
import { HavenDB } from "../src/lib/db";
import {
  award,
  complete,
  enter,
  generateUnits,
  initialize,
} from "../src/lib/engine";
import * as random from "../src/lib/random";

const deadline = Date.parse("2026-09-22T18:30:00-04:00");
const late = "2026-09-22T22:59:59.999Z";
const premium = PRIZES.filter(
  (p) => p.displayTier === "platinum" || p.displayTier === "gold",
);
let db: HavenDB | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await db?.delete();
  db = undefined;
});

describe("6:30 p.m. Eastern premium release deadline", () => {
  it.each(PRIZES.filter((p) => p.quantity !== null))(
    "caps $id only if Platinum or Gold, retaining earlier hourly releases",
    (prize) => {
      vi.spyOn(random, "randomInt").mockImplementation((max) => max - 1);
      const units = generateUnits([{ ...prize, quantity: 4 }], "fixture");
      expect(units.map((u) => u.window)).toEqual([0, 1, 2, 3]);
      expect(units.slice(0, 3).map((u) => u.releaseAt)).toEqual([
        "2026-09-22T19:59:59.999Z",
        "2026-09-22T20:59:59.999Z",
        "2026-09-22T21:59:59.999Z",
      ]);
      expect(Date.parse(units[3].releaseAt)).toBe(
        premium.includes(prize) ? deadline : Date.parse(late),
      );
    },
  );

  it("applies the exact cutoff to saved schedules without rewriting them or re-awarding/reenabling units", async () => {
    db = new HavenDB("deadline-" + crypto.randomUUID());
    const schedule = await initialize(db);
    // Model an already initialized old schedule with all units releasing late.
    schedule.units = schedule.units.map((u) => ({ ...u, releaseAt: late }));
    await db.schedules.put(schedule);
    await db.units.bulkPut(schedule.units);
    const premiumUnits = schedule.units.filter((u) =>
      premium.some((p) => p.id === u.prizeId),
    );
    expect(premiumUnits).toHaveLength(21);
    await db.units.update(premiumUnits[0].id, { disabled: true });
    await db.units.update(premiumUnits[1].id, { awardedTo: "previous-spin" });
    const before = await db.units.toArray();
    db.close();
    await db.open();
    expect(await initialize(db)).toEqual(schedule);
    const spinAt = async (n: number, now: number) => {
      const entry = await enter(
        {
          first: "Guest",
          last: "Example",
          email: `guest${n}@example.com`,
          age: true,
          waitlist: true,
        },
        db!,
        now,
      );
      const spin = await award(entry.id, db!, now);
      await complete(db!);
      return spin;
    };
    expect((await spinAt(0, deadline - 1)).prizeId).toBe("day");
    const awarded = [];
    for (let i = 1; i <= 19; i++) awarded.push(await spinAt(i, deadline));
    expect(new Set(awarded.map((s) => s.unitId)).size).toBe(19);
    expect(awarded.every((s) => premium.some((p) => p.id === s.prizeId))).toBe(
      true,
    );
    // Silver/Bronze remain locked until their original release; no finite units are recreated.
    expect((await spinAt(20, deadline)).prizeId).toBe("day");
    expect(await db.units.count()).toBe(53);
    expect(await db.schedules.toArray()).toEqual([schedule]);
    for (const original of before) {
      const current = await db.units.get(original.id);
      const spin = awarded.find((s) => s.unitId === original.id);
      expect(current).toEqual(
        spin ? { ...original, awardedTo: spin.id } : original,
      );
    }
    expect((await spinAt(21, Date.parse(late))).unitId).toBeTruthy();
  });
});
