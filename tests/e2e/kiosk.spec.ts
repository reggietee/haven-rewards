import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
const pin = readFileSync("OPERATOR_ACCESS.local.txt", "utf8").match(
  /PIN: (\d+)/,
)?.[1];
// Page-initiated reload avoids Playwright WebKit's automation reload / service-worker bug (#42273).
async function reload(page: Page) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.evaluate(() => {
      setTimeout(() => location.reload(), 0);
    }),
  ]);
}
async function readStore(page: Page, store: string) {
  return page.evaluate(async (s) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("haven-demo-day-v1");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise<Record<string, unknown>[]>((resolve) => {
      const tx = db.transaction(s);
      const r = tx.objectStore(s).getAll();
      r.onsuccess = () => {
        resolve(r.result);
        db.close();
      };
    });
  }, store);
}
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
  await page.getByLabel("Operator PIN").fill(pin!);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Readiness", exact: true }),
  ).toBeVisible();
}
async function initialize(page: Page) {
  await controls(page);
  await page.getByRole("button", { name: "Initialize real event" }).click();
  await page.getByLabel("Type INITIALIZE").fill("INITIALIZE");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Initialized · schedule locked")).toBeVisible();
  await page.getByRole("button", { name: "Close controls" }).click();
}
async function fill(page: Page, email: string, optin = true) {
  await page
    .getByRole("textbox", { name: "First name", exact: true })
    .fill("Jamie");
  await page
    .getByRole("textbox", { name: "Last name", exact: true })
    .fill("Visitor");
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill(email);
  await page.getByRole("checkbox", { name: /I am 18/ }).check();
  if (optin) await page.getByRole("checkbox", { name: /Haven.fm/ }).check();
}
async function setTime(page: Page) {
  await page.addInitScript(
    (offset) => {
      const actualNow = Date.now.bind(Date);
      Date.now = () => actualNow() + offset;
    },
    Date.parse("2026-09-22T18:55:00-04:00") - Date.now(),
  );
}
test("offline kiosk, consent, reload, reset, duplicate blocking and idempotent reconnect", async ({
  page,
  context,
  network,
}, info) => {
  test.setTimeout(120000);
  await setTime(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(network.url);
  await page.evaluate(() => document.fonts.ready);
  await initialize(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await reload(page);
  await expect(
    page.getByRole("button", { name: "Enter & Spin" }),
  ).toBeEnabled();
  await page.screenshot({
    path: `test-results/${info.project.name}-welcome.png`,
    fullPage: true,
  });
  const scheduleBefore = await readStore(page, "schedules");
  await network.offline(true);
  await fill(page, "first@example.com", false);
  expect(
    await page.getByRole("checkbox", { name: /Haven.fm/ }).isChecked(),
  ).toBe(false);
  await page.getByRole("button", { name: "Enter & Spin" }).click();
  await expect(
    page.getByRole("button", { name: "SPIN THE WHEEL" }),
  ).toHaveCount(0);
  expect(await readStore(page, "entries")).toHaveLength(0);
  await page.getByRole("checkbox", { name: /Yes, add me/ }).check();
  await page.getByRole("button", { name: "Enter & Spin" }).click();
  await expect(
    page.getByRole("button", { name: "SPIN THE WHEEL" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "SPIN THE WHEEL" }).dblclick();
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  expect(await readStore(page, "spins")).toHaveLength(1);
  await page.screenshot({
    path: `test-results/${info.project.name}-result.png`,
    fullPage: true,
  });
  await reload(page);
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  expect(await readStore(page, "spins")).toHaveLength(1);
  await page.getByRole("button", { name: /Done/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Email address" }),
  ).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "First name" })).toHaveValue(
    "",
  );
  await expect(page.getByText(/HAVEN-[A-Z2-9]{4}-[A-Z2-9]{4}/)).toHaveCount(0);
  await controls(page);
  await page.getByRole("button", { name: "Close controls" }).click();
  await fill(page, "second@example.com", true);
  await page.getByRole("button", { name: "Enter & Spin" }).click();
  await page.getByRole("button", { name: "SPIN THE WHEEL" }).click();
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  await page.waitForTimeout(16000);
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  await expect(page.getByText(/Next guest in/)).toHaveCount(0);
  await page.getByRole("button", { name: /Done/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Email address" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("checkbox", { name: /Haven.fm/ }),
  ).not.toBeChecked();
  await expect(page.getByText(/HAVEN-[A-Z2-9]{4}-[A-Z2-9]{4}/)).toHaveCount(0);
  expect((await readStore(page, "device"))[0].activeEntryId).toBeUndefined();
  await fill(page, "FIRST@EXAMPLE.COM");
  await page.getByRole("button", { name: "Enter & Spin" }).click();
  await expect(page.getByRole("alert")).toContainText("already has an entry");
  expect(await readStore(page, "entries")).toHaveLength(2);
  const consents = await readStore(page, "consents");
  expect(consents.map((c) => c.choice).sort()).toEqual([true, true]);
  expect(
    consents.every(
      (c) => c.source === "Demo Day booth" && typeof c.text === "string",
    ),
  ).toBe(true);
  await reload(page);
  await expect(page.getByRole("textbox", { name: "First name" })).toHaveValue(
    "",
  );
  expect(await readStore(page, "schedules")).toEqual(scheduleBefore);
  expect(await readStore(page, "spins")).toHaveLength(2);
  // Contract mock for Google transport: response loss/retry is covered separately at handler level.
  const rows = new Map<string, string>();
  let requests = 0;
  const respond = (body: {
    records: { id: string; tab: string; seq: number }[];
  }) => {
    requests++;
    for (const r of body.records) {
      const key = r.tab + ":" + r.seq;
      const old = rows.get(key);
      if (old) expect(old).toBe(r.id);
      rows.set(key, r.id);
    }
    return { accepted: body.records.map((r) => r.id) };
  };
  if (network.mockSync) network.mockSync(respond);
  else
    await page.route("**/api/sync", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(respond(route.request().postDataJSON())),
      });
    });
  await network.offline(false);
  await controls(page);
  await page.getByRole("button", { name: "Retry synchronization" }).click();
  await expect
    .poll(
      async () =>
        (await readStore(page, "queue")).filter((r) => r.status === "pending")
          .length,
      { timeout: 30000 },
    )
    .toBe(0);
  expect(requests).toBeGreaterThan(0);
  const synced = (await readStore(page, "queue")).filter(
    (r) => r.status === "synced",
  );
  expect(rows.size).toBe(synced.length);
  await page.screenshot({
    path: `test-results/${info.project.name}-controls.png`,
    fullPage: true,
  });
  for (const tab of ["Entries", "Consents", "Spins", "Inventory", "Audit"]) {
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: `Export ${tab}`, exact: true })
      .click();
    const file = await downloaded;
    const content = readFileSync((await file.path())!, "utf8");
    expect(content).toContain("syncStatus");
    expect(content).not.toContain("review_flag");
    if (tab === "Consents") {
      expect(content).toContain("first@example.com");
      expect(content).toContain("second@example.com");
      expect(content).toContain("Demo Day booth");
    }
  }
  expect(errors).toEqual([]);
});
test("all five celebration tiers and sponsor reveals are previewable without production records", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await controls(page);
  const prizes = [
    "1-Day Coworking Pass",
    "1-Month Part-Time Membership in NOTL",
    "Story Mode marketing audit",
    "6-month NOTL Business Mailing Address",
    "3-month Full-Time Haven Membership in NOTL",
    "Niagara Passport Membership, 1 month (Haven + NFIH)",
  ];
  for (let i = 0; i < prizes.length; i++) {
    const button = page
      .locator(".preview-grid button")
      .filter({ hasText: prizes[i] })
      .first();
    await button.click();
    await expect(page.getByText("TEST ONLY · NO PRIZE AWARDED")).toBeVisible();
    await expect(
      page.locator(`.celebration-${Math.min(i + 1, 5)}`),
    ).toBeAttached();
    await page.screenshot({
      path: `test-results/${info.project.name}-tier-${i + 1}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /Done/ }).click();
    await page.getByRole("button", { name: "Exit test" }).click();
    await page.getByLabel("Operator PIN").fill(pin!);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
  }
  expect(await readStore(page, "entries")).toHaveLength(0);
  expect(await readStore(page, "spins")).toHaveLength(0);
  expect(await readStore(page, "units")).toHaveLength(0);
});
test("public rules are readable and cached offline, with every prize and no drafting markers", async ({
  page,
  context,
  network,
}, info) => {
  await page.goto(network.url + "/rules");
  await expect(
    page.getByRole("heading", { name: "Spin Your Way to Haven" }),
  ).toBeVisible();
  await expect(page.getByText(/7,980/)).toBeVisible();
  await expect(page.getByText(/\[TBC\]/)).toHaveCount(0);
  await expect(page.getByText(/EDITABLE REVIEW DRAFT/)).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-rules.png`,
    fullPage: true,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await network.offline(true);
  await reload(page);
  await expect(page.getByText(/30 calendar days after/)).toBeVisible();
});
test("portrait and WebGL fallback retain form, controls and logos", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl")) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/");
  await expect(page.locator(".wheel-stage")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Email address" }),
  ).toBeVisible();
  expect(
    await page
      .locator("img.brand")
      .evaluateAll((images) =>
        images.every((i) => (i as HTMLImageElement).naturalWidth > 0),
      ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-portrait.png`,
    fullPage: true,
  });
  const entryButton = await page.locator(".entry-submit").boundingBox();
  expect(entryButton!.y + entryButton!.height).toBeLessThan(1112);
  await controls(page);
  await page
    .locator(".preview-grid button")
    .filter({ hasText: "1-Day Coworking Pass" })
    .click();
  await expect(page.locator(".flat-wheel")).toBeVisible();
});
test("full-motion grand sequence completes with WebGL and a persistent mute control", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await controls(page);
  await page
    .locator(".preview-grid button")
    .filter({ hasText: "Niagara Passport Membership, 1 month (Haven + NFIH)" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Here we go." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Mute sound" })).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-spinning.png`,
    fullPage: true,
  });
  await expect(page.getByText("TEST ONLY · NO PRIZE AWARDED")).toBeVisible({
    timeout: 20000,
  });
  const angle = Number(
    await page.locator(".wheel-stage").getAttribute("data-angle"),
  );
  expect(Math.cos(angle)).toBeCloseTo(-1);
  expect(Math.sin(angle)).toBeCloseTo(0);
  await expect(page.locator(".celebration-5 .shockwave")).toBeAttached();
  await expect(page.locator(".grand-wordmark")).toBeAttached();
  await page.screenshot({
    path: `test-results/${info.project.name}-grand-motion.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Mute sound" }).click();
  await expect(
    page.getByRole("button", { name: "Turn sound on" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("home pairs entry with one wheel; constrained height preserves reachable controls", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".vault-card")).toHaveCount(12);
  await expect(page.locator(".wheel-stage")).toHaveCount(1);
  await expect(page.locator(".wheel-canvas canvas")).toHaveCount(1);
  await expect(page.locator('[data-prize-id="passport"]')).toContainText(
    "3 in today’s prize pool",
  );
  await expect(
    page.getByRole("heading", { name: "Today’s Prize Vault" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeGreaterThan(834);
  await page.screenshot({
    path: `test-results/${info.project.name}-home.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1112, height: 500 });
  await expect(page.locator(".vault-scroll")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("keyboard@example.com");
  await expect(
    page.getByRole("textbox", { name: "Email address" }),
  ).toHaveValue("keyboard@example.com");
  expect(
    (await page.getByRole("textbox", { name: "Email address" }).boundingBox())!
      .height,
  ).toBeGreaterThanOrEqual(56);
  await page.screenshot({
    path: `test-results/${info.project.name}-keyboard.png`,
    fullPage: true,
  });
});
