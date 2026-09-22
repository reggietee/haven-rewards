import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { announcementText } from "../../src/lib/announcements";
const pin = readFileSync("OPERATOR_ACCESS.local.txt", "utf8").match(
  /PIN: (\d+)/,
)![1];
const audio = readFileSync("tests/fixtures/voice-tone.mp3").toString("base64");
async function start(page: Page) {
  await page.goto("/");
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
  await page.getByRole("button", { name: "Open test entry flow" }).click();
  await expect(page.getByRole("button", { name: "Exit test" })).toBeVisible();
  await page
    .getByRole("textbox", { name: "First name", exact: true })
    .fill("Élodie");
  await page
    .getByRole("textbox", { name: "Last name", exact: true })
    .fill("Private Surname");
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill("voice-private@example.com");
  await page.getByRole("checkbox", { name: /I am 18/ }).check();
  await page.getByRole("checkbox", { name: /Yes, add me/ }).check();
  await page.getByRole("button", { name: "Enter & Spin" }).click();
}
async function saved(page: Page, table: string) {
  return page.evaluate(async (table) => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("haven-demo-day-test-v3");
      r.onsuccess = () => resolve(r.result);
    });
    const rows = await new Promise<unknown[]>((resolve) => {
      const r = d.transaction(table).objectStore(table).getAll();
      r.onsuccess = () => resolve(r.result);
    });
    d.close();
    return rows;
  }, table);
}
test("personalized speech uses saved entry during spin, lands before voice, replays once from memory and clears on manual Done", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let calls = 0,
    spoken = "",
    phase = "",
    spinRecorded = false;
  await page.route("**/api/winner-voice", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual([
      "entryId",
      "firstName",
      "prizeId",
    ]);
    expect(body.firstName).toBe("Élodie");
    expect(route.request().url()).not.toMatch(/Élodie|voice-private|Surname/);
    expect(route.request().postData()).not.toMatch(
      /email|Surname|voice-private|text/,
    );
    phase =
      (await page.locator(".wheel-stage").getAttribute("data-mode")) ?? "";
    spinRecorded = (await saved(page, "spins")).length === 1;
    spoken = announcementText(body.prizeId, body.firstName)!;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: spoken,
        mimeType: "audio/mpeg",
        audioBase64: audio,
      }),
      headers: { "Cache-Control": "no-store" },
    });
  });
  await start(page);
  // Any cleared/display-only form state is irrelevant: payload is read back from IndexedDB.
  await page.getByRole("button", { name: "SPIN THE WHEEL" }).click();
  await expect.poll(() => calls).toBe(1);
  expect(phase).toBe("spinning");
  await expect.poll(() => spinRecorded).toBe(true);
  await expect(page.locator(".winner-caption")).toHaveCount(0);
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  await expect(page.locator(".winner-announcement")).toHaveAttribute(
    "data-speaking",
    "true",
  );
  await expect(page.locator(".winner-caption")).toHaveText(spoken);
  await expect(
    page.getByRole("button", { name: "Hear your prize announcement again" }),
  ).toBeDisabled();
  await page.screenshot({
    path: `test-results/${info.project.name}-voice-result.png`,
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Hear your prize announcement again" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Hear your prize announcement again" })
    .click();
  await expect(page.locator(".winner-announcement")).toHaveAttribute(
    "data-speaking",
    "true",
  );
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Mute sound" }).click();
  await expect(
    page.getByRole("button", { name: "Hear your prize announcement again" }),
  ).toHaveCount(0);
  await expect(page.locator(".winner-announcement")).toHaveAttribute(
    "data-speaking",
    "false",
  );
  await page.getByRole("button", { name: /Done/ }).click();
  await expect(page.locator(".winner-caption")).toHaveCount(0);
  await expect(page.getByText(/Élodie/)).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "First name", exact: true }),
  ).toHaveValue("");
  expect(await saved(page, "spins")).toHaveLength(1);
  expect(await saved(page, "voiceAttempts")).toHaveLength(1);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys()) {
      for (const r of await (await caches.open(key)).keys()) urls.push(r.url);
    }
    return urls;
  });
  expect(cached.some((url) => url.includes("winner-voice"))).toBe(false);
});
test("muted spin skips generation; result stays open past the former timeout until Done", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  let calls = 0;
  await page.route("**/api/winner-voice", async (route) => {
    calls++;
    await route.abort();
  });
  await start(page);
  await page.getByRole("button", { name: "Mute sound" }).click();
  await page.getByRole("button", { name: "SPIN THE WHEEL" }).click();
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  await page.waitForTimeout(16000);
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  expect(calls).toBe(0);
  await expect(page.getByText(/Next guest in/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Hear your prize announcement again" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Done/ }).click();
  await expect(
    page.getByRole("textbox", { name: "First name", exact: true }),
  ).toHaveValue("");
});
test("slow provider never holds the result or speaks after Done, including reduced motion", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  let calls = 0;
  await page.route("**/api/winner-voice", async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.fulfill({ status: 503, body: "unavailable" }).catch(() => {});
  });
  await start(page);
  const before = Date.now();
  await page.getByRole("button", { name: "SPIN THE WHEEL" }).click();
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  expect(Date.now() - before).toBeLessThan(5000);
  await page.getByRole("button", { name: /Done/ }).click();
  await page.waitForTimeout(6500);
  await expect(page.locator(".winner-caption")).toHaveCount(0);
  await expect(page.getByText(/Élodie/)).toHaveCount(0);
  expect(calls).toBeLessThanOrEqual(1);
  expect(await saved(page, "spins")).toHaveLength(1);
});

test("missing credentials and offline mode still show and retain the recorded prize", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const statuses: number[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith("/api/winner-voice"))
      statuses.push(response.status());
  });
  await start(page);
  await page.getByRole("button", { name: "SPIN THE WHEEL" }).click();
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  await expect.poll(() => statuses).toContain(503);
  await expect(page.locator(".winner-caption")).toContainText("Élodie");
  await page.getByRole("button", { name: /Done/ }).click();
  await page
    .getByRole("textbox", { name: "First name", exact: true })
    .fill("Maya");
  await page
    .getByRole("textbox", { name: "Last name", exact: true })
    .fill("Visitor");
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill("offline-voice@example.com");
  await page.getByRole("checkbox", { name: /I am 18/ }).check();
  await page.getByRole("checkbox", { name: /Yes, add me/ }).check();
  await page.getByRole("button", { name: "Enter & Spin" }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByRole("button", { name: "SPIN THE WHEEL" }).click();
  await expect(page.getByText("YOUR POTENTIAL PRIZE CODE")).toBeVisible();
  await expect(page.locator(".winner-caption")).toContainText("Maya");
  expect(statuses).toEqual([503]);
  expect(await saved(page, "spins")).toHaveLength(2);
  await page.getByRole("button", { name: /Done/ }).click();
  await expect(page.locator(".winner-caption")).toHaveCount(0);
});
