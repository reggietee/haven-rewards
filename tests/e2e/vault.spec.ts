import { test, expect } from "./fixtures";
import { PRIZES, currency } from "../../src/config";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
const pin = readFileSync("OPERATOR_ACCESS.local.txt", "utf8").match(
  /PIN: (\d+)/,
)![1];
async function controls(page: Page) {
  // Initial software-GPU shader compilation can delay the first tap sequence.
  await expect(async () => {
    if (!(await page.getByLabel("Operator PIN").isVisible()))
      await page
        .getByRole("button", { name: "Haven Workspace", exact: true })
        .click({ clickCount: 5, delay: 60 });
    await expect(page.getByLabel("Operator PIN")).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: 15000 });
  await page.getByLabel("Operator PIN").fill(pin);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Readiness", exact: true }),
  ).toBeVisible();
}
test("hero wheel and full gallery use one document scroll, with every prize and sponsor reachable", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".wheel-stage")).toHaveAttribute(
    "data-mode",
    "idle",
  );
  await expect(page.locator(".wheel-stage")).toHaveAttribute(
    "data-rendering",
    "paused",
  );
  await expect(page.locator(".vault-card")).toHaveCount(12);
  for (const prize of PRIZES) {
    const card = page.locator(`[data-prize-id="${prize.id}"]`);
    await expect(card.locator("h4")).toHaveText(prize.displayName);
    await expect(card.locator(".vault-value")).toContainText(
      currency(prize.value),
    );
    await expect(card.locator(".vault-count")).toHaveText(
      prize.quantity === null
        ? "Unlimited fallback"
        : `${prize.quantity} in today’s prize pool`,
    );
  }

  await expect(page.locator(".grand-badge")).toHaveCount(2);
  await expect(page.locator(".kiosk-main .vault-card")).toHaveCount(0);
  await expect(page.locator(".vault-scroll")).toHaveCount(0);
  const form = await page.locator(".flow-panel").boundingBox();
  const wheel = await page.locator(".wheel-stage").boundingBox();
  const action = await page.locator(".entry-submit").boundingBox();
  expect(wheel!.x).toBeGreaterThan(form!.x + form!.width - 5);
  expect(action!.y + action!.height).toBeLessThan(834);
  expect(
    (await page.locator(".prize-vault").boundingBox())!.y,
  ).toBeGreaterThanOrEqual(800);
  await page.screenshot({ path: `test-results/${info.project.name}-hero.png` });
  await page.getByRole("link", { name: "Explore today’s prizes" }).click();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  for (const card of await page.locator(".vault-card").all()) {
    await card.evaluate((e) => e.scrollIntoView({ block: "center" }));
    const r = await card.boundingBox();
    expect(r!.y).toBeGreaterThanOrEqual(-1);
    expect(r!.y + r!.height).toBeLessThanOrEqual(835);
    await expect(card.locator(".vault-metal-label")).toBeVisible();
  }
  await expect(page.locator(".vault-header")).toContainText(
    "53 featured prizes",
  );
  await expect(page.locator(".vault-header")).toContainText(
    "Everyone wins at least a Haven Coworking Day Pass",
  );
  expect(
    await page
      .locator(".vault-marks img")
      .evaluateAll((es) =>
        es.every((e) => (e as HTMLImageElement).naturalWidth > 0),
      ),
  ).toBe(true);
  await page.locator(".kiosk-footer").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Read official rules" }),
  ).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1112,
  );
  const traps = await page
    .locator(".screen-welcome *")
    .evaluateAll((es) =>
      es
        .filter(
          (e) =>
            ["auto", "scroll"].includes(getComputedStyle(e).overflowY) &&
            e.scrollHeight > e.clientHeight,
        )
        .map((e) => e.className),
    );
  expect(traps).toEqual([]);
  await page.locator(".metal-platinum").evaluate((e) => {
    (e as HTMLElement).style.filter = "grayscale(1)";
    e.scrollIntoView();
  });
  await page.screenshot({
    path: `test-results/${info.project.name}-gallery-grayscale.png`,
  });
});

test("idle rotation is silent, pauses offscreen and hidden, and reduced motion stops it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let starts = 0;
    Object.defineProperty(window, "__testAudioStarts", { get: () => starts });
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when) {
      starts++;
      start.call(this, when);
    };
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const stage = page.locator(".wheel-stage");
  await expect(stage).toHaveAttribute("data-rendering", "active");
  await expect
    .poll(async () => Number(await stage.getAttribute("data-angle")))
    .toBeGreaterThan(0);
  const sample = () =>
    page.evaluate(
      () =>
        new Promise<{ angle: number; time: number }>((resolve) =>
          requestAnimationFrame((time) =>
            resolve({
              angle: Number(
                document.querySelector<HTMLElement>(".wheel-stage")!.dataset
                  .angle,
              ),
              time,
            }),
          ),
        ),
    );
  const before = await sample();
  await page.waitForTimeout(1500);
  const after = await sample();
  const elapsed = after.time - before.time;
  const delta = after.angle - before.angle;
  expect(delta / (elapsed / 1000)).toBeGreaterThan(0.055);
  expect(delta / (elapsed / 1000)).toBeLessThan(0.085);
  expect(await stage.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe(
    "none",
  );
  await page.locator(".metal-gold").scrollIntoViewIfNeeded();
  await expect(stage).toHaveAttribute("data-rendering", "paused");
  const stopped = await stage.getAttribute("data-angle");
  await page.waitForTimeout(300);
  expect(await stage.getAttribute("data-angle")).toBe(stopped);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(stage).toHaveAttribute("data-rendering", "active");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(stage).toHaveAttribute("data-rendering", "paused");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(stage).toHaveAttribute("data-rendering", "paused");
  const reducedAngle = await stage.getAttribute("data-angle");
  await page.waitForTimeout(300);
  expect(await stage.getAttribute("data-angle")).toBe(reducedAngle);
  expect(
    await page
      .locator(".metal-gold .vault-card")
      .first()
      .evaluate((e) => getComputedStyle(e, "::after").animationName),
  ).toBe("none");
  await expect(page.locator(".prize-code, .celebration")).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "__testAudioStarts")),
  ).toBe(0);
  const recordedSpins = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const request = indexedDB.open("haven-demo-day-v1");
        request.onsuccess = () => {
          const database = request.result;
          const count = database
            .transaction("spins")
            .objectStore("spins")
            .count();
          count.onsuccess = () => {
            resolve(count.result);
            database.close();
          };
        };
      }),
  );
  expect(recordedSpins).toBe(0);
});

test("inactivity preserves browsing position and a keyboard-sized viewport keeps controls reachable", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("textbox", { name: "First name" }).fill("Kept");
  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.clock.fastForward(60000);
  expect(await page.evaluate(() => window.scrollY)).toBe(1600);
  await page.clock.resume();
  await page.setViewportSize({ width: 1112, height: 500 });
  for (const selector of [
    'input[name="first"]',
    'input[name="last"]',
    'input[name="email"]',
    ".required-check",
    ".consent-check",
    ".entry-submit",
  ]) {
    const el = page.locator(selector);
    await el.scrollIntoViewIfNeeded();
    const r = await el.boundingBox();
    expect(r!.y).toBeGreaterThanOrEqual(0);
    expect(r!.y + r!.height).toBeLessThanOrEqual(501);
  }
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1112, height: 834 });
  await expect(page.getByRole("textbox", { name: "First name" })).toHaveValue(
    "Kept",
  );
});

test("award updates remaining counts, keeps depleted cards in order, and resets vault after Done", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.addInitScript(
    (offset) => {
      const actual = Date.now.bind(Date);
      Date.now = () => actual() + offset;
    },
    Date.parse("2026-09-22T15:01:00-04:00") - Date.now(),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await controls(page);
  await page.getByRole("button", { name: "Initialize real event" }).click();
  await page.getByLabel("Type INITIALIZE").fill("INITIALIZE");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Initialized · schedule locked")).toBeVisible();
  await page.getByRole("button", { name: "Close controls" }).click();
  // Isolated browser fixture: one matured candidate makes the UI result deterministic.
  await page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("haven-demo-day-v1");
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction("units", "readwrite"),
        s = tx.objectStore("units"),
        r = s.getAll();
      r.onsuccess = () => {
        for (const u of r.result)
          s.put({
            ...u,
            releaseAt:
              u.prizeId === "full-3"
                ? "2026-09-22T15:00:00-04:00"
                : "2026-09-22T18:59:59-04:00",
          });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    d.close();
  });
  const ids = await page
    .locator(".vault-card")
    .evaluateAll((es) => es.map((e) => e.getAttribute("data-prize-id")));
  await page.evaluate(() => window.scrollTo(0, 1300));
  await page.getByRole("textbox", { name: "First name" }).fill("Vault");
  await page.getByRole("textbox", { name: "Last name" }).fill("Visitor");
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("vault@example.com");
  await page.getByRole("checkbox", { name: /I am 18/ }).check();
  await page.getByRole("checkbox", { name: /Yes, add me/ }).check();
  const canvas = await page.locator(".wheel-canvas canvas").elementHandle();
  await page.getByRole("button", { name: "Enter & Spin" }).click();
  expect(
    await canvas!.evaluate(
      (e) => e === document.querySelector(".wheel-canvas canvas"),
    ),
  ).toBe(true);
  await expect(page.locator(".wheel-canvas canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "SPIN THE WHEEL" }).click();
  expect(
    await canvas!.evaluate(
      (e) => e === document.querySelector(".wheel-canvas canvas"),
    ),
  ).toBe(true);
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  const landed = Number(
    await page.locator(".wheel-stage").getAttribute("data-angle"),
  );
  expect(Math.sin(landed)).toBeCloseTo(0);
  expect(Math.cos(landed)).toBeCloseTo(1);
  await page.getByRole("button", { name: /Done/ }).click();
  await expect(page.locator(".wheel-stage")).toHaveAttribute(
    "data-mode",
    "idle",
  );
  expect(
    await canvas!.evaluate(
      (e) => e === document.querySelector(".wheel-canvas canvas"),
    ),
  ).toBe(true);
  await expect(
    page.locator('[data-prize-id="full-3"] .vault-count'),
  ).toHaveText("0 remaining");
  await expect(page.locator(".vault-summary strong")).toHaveText(
    "53 featured prizes · 52 remaining",
  );
  expect(
    await page
      .locator(".vault-card")
      .evaluateAll((es) => es.map((e) => e.getAttribute("data-prize-id"))),
  ).toEqual(ids);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator(".vault-nudge")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-vault-awarded.png`,
  });
});

test("portrait stacks form then wheel then the complete naturally scrolling gallery", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const action = await page.locator(".entry-submit").boundingBox();
  expect(action!.y + action!.height).toBeLessThan(1112);
  const wheel = await page.locator(".wheel-stage").boundingBox();
  expect(wheel!.y).toBeGreaterThan(action!.y + action!.height);
  await page.screenshot({
    path: `test-results/${info.project.name}-portrait-entry.png`,
  });
  for (const card of await page.locator(".vault-card").all()) {
    await card.evaluate((e) => e.scrollIntoView({ block: "center" }));
    const r = await card.boundingBox();
    expect(r!.y).toBeGreaterThanOrEqual(-1);
    expect(r!.y + r!.height).toBeLessThanOrEqual(1113);
  }
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    834,
  );
  await page.getByRole("button", { name: "Back to spin" }).click();
  await expect(page.getByRole("textbox", { name: "First name" })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
