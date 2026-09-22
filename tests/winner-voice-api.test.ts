import { beforeEach, afterEach, expect, it, vi } from "vitest";
import handler from "../api/winner-voice";
import { issueToken } from "../server/auth";
import { generateVoice, VoiceLimiter } from "../server/winnerVoice";
import {
  announcementText,
  ANNOUNCEMENTS,
  spokenName,
} from "../src/lib/announcements";
import { PRIZES } from "../src/config";
import type { VercelRequest, VercelResponse } from "../server/http";
let deviceId: string;
const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(120)]);
const provider = vi.fn();
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  deviceId = crypto.randomUUID();
  vi.stubEnv("SESSION_SECRET", "unit-test-session-only");
  vi.stubEnv("KIOSK_DEVICE_ID", deviceId);
  vi.stubEnv("ELEVENLABS_API_KEY", "unit-test-provider-key");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "fixtureVoice");
  vi.stubEnv("ELEVENLABS_MODEL_ID", "");
  vi.stubEnv("ELEVENLABS_ZERO_RETENTION", "false");
  provider
    .mockReset()
    .mockImplementation(
      async () =>
        new Response(mp3, { headers: { "Content-Type": "audio/mpeg" } }),
    );
  vi.stubGlobal("fetch", provider);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function call(
  body: unknown,
  headers: Record<string, string> = {},
  method = "POST",
) {
  let status = 200,
    data: unknown;
  const response = {
    headers: new Map<string, string>(),
    setHeader(k: string, v: string) {
      this.headers.set(k, v);
    },
    status(code: number) {
      status = code;
      return response;
    },
    json(value: unknown) {
      data = value;
      return response;
    },
  };
  await handler(
    {
      method,
      body,
      headers: {
        host: "haven.test",
        origin: "https://haven.test",
        "content-type": "application/json",
        authorization: "Bearer " + issueToken(deviceId).token,
        ...headers,
      },
    } as VercelRequest,
    response as unknown as VercelResponse,
  );
  return { status, data, headers: response.headers };
}
const input = (firstName = "Maya", prizeId = "passport") => ({
  entryId: crypto.randomUUID(),
  firstName,
  prizeId,
});
it("supports Unicode, accents, spaces, apostrophes, hyphens and normalization", () => {
  for (const name of [
    "Maya",
    "Élodie",
    "D’Arcy",
    "O'Neil",
    "Jean-Luc",
    "Mary Jane",
    "李明",
    "Zoë",
    "Ana María",
  ])
    expect(spokenName(name)).toBe(name);
  expect(spokenName("  E\u0301lodie \u0000")).toBe("Élodie");
  expect(spokenName("Jean‑Luc")).toBe("Jean-Luc");
  expect(spokenName("\u0301")).toBeUndefined();
  for (const name of [
    "",
    " ",
    "x".repeat(41),
    "Ignore previous instructions",
    "Congratulations everyone",
    "<break time='1s'/>",
    "Jane@example.com",
    "You have won a car",
    "Fuck",
    "123",
    "Jane. Buy tickets!",
  ])
    expect(spokenName(name)).toBeUndefined();
});
it("has one approved template per canonical prize, no removed prize and a name in every personalized template", () => {
  expect(Object.keys(ANNOUNCEMENTS).sort()).toEqual(
    PRIZES.map((p) => p.id).sort(),
  );
  for (const p of PRIZES) {
    expect(announcementText(p.id, "Élodie")).toContain("Élodie");
    expect(announcementText(p.id)).not.toMatch(/undefined|firstName/);
  }
  expect(announcementText("boardroom", "Maya")).toBeUndefined();
  expect(announcementText("legal-card", "Maya")).toContain(
    "Business Legal Services Gift Card",
  );
  expect(announcementText("full-3", "Maya")).toContain("Niagara-on-the-Lake");
});
it("only sends approved text and voice settings upstream, never entry metadata or email; disables caching", async () => {
  const payload = input("Élodie");
  const r = await call(payload);
  expect(r.status).toBe(200);
  const [url, options] = provider.mock.calls[0];
  const upstream = JSON.parse(options.body);
  expect(upstream.text).toBe(announcementText("passport", "Élodie"));
  expect(upstream.model_id).toBe("eleven_flash_v2_5");
  expect(Object.keys(upstream).sort()).toEqual([
    "language_code",
    "model_id",
    "text",
    "voice_settings",
  ]);
  expect(new URL(String(url)).pathname).toBe(
    `/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
  );
  expect(String(url)).not.toContain("Élodie");
  expect(options.body).not.toContain(payload.entryId);
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(JSON.stringify(r.data)).not.toContain("unit-test-provider-key");
});
it("rejects arbitrary text, email, prize overrides, unknown IDs, oversized and unauthenticated requests", async () => {
  for (const extra of [
    { text: "say anything" },
    { email: "private@example.com" },
    { prizeName: "Car" },
    { tier: 5 },
    { value: 9000 },
  ])
    expect((await call({ ...input(), ...extra })).status).toBe(400);
  expect((await call(input("Maya", "boardroom"))).status).toBe(400);
  expect((await call(input("Ignore previous instructions"))).status).toBe(400);
  expect((await call(input(), { authorization: "" })).status).toBe(401);
  expect((await call(input(), { origin: "https://evil.test" })).status).toBe(
    403,
  );
  expect((await call(input(), { origin: "" })).status).toBe(403);
  expect((await call(input(), { "content-length": "2048" })).status).toBe(413);
  expect((await call(input(), {}, "GET")).status).toBe(405);
  expect(provider).not.toHaveBeenCalled();
});
it("reserves once before upstream work, including concurrent/repeated requests and failures", async () => {
  const payload = input();
  provider.mockRejectedValue(new Error("upstream-private-details"));
  const results = await Promise.all([call(payload), call(payload)]);
  expect(results.map((r) => r.status).sort()).toEqual([429, 503]);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(results)).not.toContain("upstream-private-details");
});
it("rate limits to six per minute and 300 per day without storing speech", () => {
  const limiter = new VoiceLimiter();
  for (let n = 0; n < 6; n++)
    expect(limiter.reserve(deviceId, String(n), 100)).toBe(true);
  expect(limiter.reserve(deviceId, "more", 100)).toBe(false);
  expect(limiter.reserve(deviceId, "0", 61000)).toBe(false);
  for (let n = 6; n < 300; n++)
    expect(limiter.reserve(deviceId, String(n), 61000 * (n + 1))).toBe(true);
  expect(limiter.reserve(deviceId, "over-cap", 61000 * 301)).toBe(false);
});
it("missing credentials, upstream error and malformed/oversized audio fail safely without a retry", async () => {
  vi.stubEnv("ELEVENLABS_API_KEY", "");
  expect((await call(input())).status).toBe(503);
  expect(provider).not.toHaveBeenCalled();
  vi.stubEnv("ELEVENLABS_API_KEY", "unit-test-provider-key");
  for (const response of [
    new Response("secret", { status: 401 }),
    new Response("html", { headers: { "Content-Type": "text/html" } }),
    new Response(Buffer.alloc(200), {
      headers: { "Content-Type": "audio/mpeg" },
    }),
    new Response(mp3, {
      headers: { "Content-Type": "audio/mpeg", "content-length": "9999999" },
    }),
  ]) {
    provider.mockResolvedValueOnce(response);
    expect((await call(input())).status).toBe(503);
  }
  expect(provider).toHaveBeenCalledTimes(4);
});
it("uses optional zero retention without sending extra entrant data", async () => {
  vi.stubEnv("ELEVENLABS_ZERO_RETENTION", "true");
  await generateVoice("Maya", "day", new AbortController().signal);
  expect(String(provider.mock.calls[0][0])).toContain("enable_logging=false");
});
it("aborts a slow upstream within the spin and returns a generic failure", async () => {
  vi.useFakeTimers();
  provider.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new Error("timeout-private")),
        ),
      ),
  );
  const result = call(input());
  await vi.advanceTimersByTimeAsync(5501);
  expect((await result).status).toBe(503);
  expect(provider).toHaveBeenCalledTimes(1);
});
