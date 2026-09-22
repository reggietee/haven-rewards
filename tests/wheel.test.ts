import { PRIZES, WHEEL_PRIZES } from "../src/config";
import { describe, expect, it } from "vitest";
import {
  idleAdvance,
  IDLE_REVOLUTION_MS,
  landingRotation,
  spinProgress,
  TAU,
} from "../src/lib/wheelMath";
describe("attract wheel and recorded landing", () => {
  it("rotates constantly once per 90 seconds", () => {
    expect(IDLE_REVOLUTION_MS).toBe(90000);
    expect(idleAdvance(90000)).toBeCloseTo(TAU);
    expect(idleAdvance(1000) * 90).toBeCloseTo(TAU);
    expect(idleAdvance(0)).toBe(0);
  });
  it("lands on every persisted sector from arbitrary idle positions", () => {
    for (const from of [0, 0.82, 5.9, TAU * 3 + 2.4])
      for (let index = 0; index < WHEEL_PRIZES.length; index++) {
        const end = landingRotation(index, WHEEL_PRIZES.length, from);
        expect(end - from).toBeGreaterThanOrEqual(TAU * 7);
        expect(Math.sin(end)).toBeCloseTo(
          Math.sin((index * TAU) / WHEEL_PRIZES.length),
        );
        expect(Math.cos(end)).toBeCloseTo(
          Math.cos((index * TAU) / WHEEL_PRIZES.length),
        );
        expect(from + (end - from) * spinProgress(0)).toBe(from);
        expect(from + (end - from) * spinProgress(1)).toBe(end);
      }
  });
});

it("shows every current prize once and places the two gold grand sectors opposite", () => {
  expect(WHEEL_PRIZES).toHaveLength(12);
  expect(new Set(WHEEL_PRIZES.map((p) => p.id))).toEqual(
    new Set(PRIZES.map((p) => p.id)),
  );
  expect(PRIZES.some((p) => p.id === "boardroom")).toBe(false);
  const grands = WHEEL_PRIZES.flatMap((p, i) => (p.tier === 5 ? [i] : []));
  expect(grands).toHaveLength(2);
  expect(grands[1] - grands[0]).toBe(WHEEL_PRIZES.length / 2);
  expect(grands.map((i) => WHEEL_PRIZES[i].id)).toEqual(["full-3", "passport"]);
});
