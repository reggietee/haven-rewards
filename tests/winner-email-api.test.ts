import { beforeEach, afterEach, expect, it, vi } from "vitest";
import handler from "../api/winner-email";
import { issueToken } from "../server/auth";
import type { VercelRequest, VercelResponse } from "../server/http";
let deviceId: string;
const provider = vi.fn();
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  deviceId = crypto.randomUUID();
  vi.stubEnv("SESSION_SECRET", "unit-test-session-only");
  vi.stubEnv("KIOSK_DEVICE_ID", deviceId);
  vi.stubEnv("RESEND_API_KEY", "unit-test-provider-key");
  vi.stubEnv("WINNER_EMAIL_FROM", "Haven <hello@cloud.havenworkspace.ca>");
  provider
    .mockReset()
    .mockImplementation(async () => Response.json({ id: "provider-id-1" }));
  vi.stubGlobal("fetch", provider);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function call(
  body: unknown,
  headers: Record<string, string> = {},
  method = "POST",
) {
  let status = 200,
    data: Record<string, string> = {};
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
      data = value as Record<string, string>;
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
const input = (over: Record<string, unknown> = {}) => ({
  name: "Dana Okafor",
  email: "dana@example.com",
  prizeId: "bundle",
  code: "HAVEN-AAA-01",
  ...over,
});
it("sends one approved message and returns the provider id", async () => {
  const { status, data } = await call(input());
  expect(status).toBe(200);
  expect(data.id).toBe("provider-id-1");
  expect(provider).toHaveBeenCalledTimes(1);
  const [url, init] = provider.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  const sent = JSON.parse(init.body);
  expect(sent.to).toEqual(["dana@example.com"]);
  expect(sent.from).toBe("Haven <hello@cloud.havenworkspace.ca>");
  expect(sent.reply_to).toBe("reggie@havenworkspace.ca");
  expect(sent.subject).toContain("Haven Event + Coworking Day Bundle");
  expect(sent.text).toContain("HAVEN-AAA-01");
});
it("previews without contacting the provider", async () => {
  const { status, data } = await call(input({ preview: true }));
  expect(status).toBe(200);
  expect(data.subject).toContain("Haven Event + Coworking Day Bundle");
  expect(provider).not.toHaveBeenCalled();
});
it("never accepts caller-supplied message content", async () => {
  const { status } = await call(
    input({ html: "<b>anything</b>", subject: "Override" }),
  );
  expect(status).toBe(400);
  expect(provider).not.toHaveBeenCalled();
});
it("rejects an unknown prize, a bad address and a malformed code", async () => {
  expect((await call(input({ prizeId: "made-up" }))).status).toBe(400);
  expect((await call(input({ email: "not-an-address" }))).status).toBe(400);
  expect((await call(input({ code: "bad code!" }))).status).toBe(400);
  expect(provider).not.toHaveBeenCalled();
});
it("requires a valid token, same origin, POST and json", async () => {
  expect((await call(input(), { authorization: "Bearer nope" })).status).toBe(
    401,
  );
  expect((await call(input(), { origin: "https://evil.test" })).status).toBe(
    403,
  );
  expect((await call(input(), {}, "GET")).status).toBe(405);
  expect((await call(input(), { "content-type": "text/plain" })).status).toBe(
    415,
  );
  expect(provider).not.toHaveBeenCalled();
});
it("reports configuration and provider failures without leaking detail", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect((await call(input())).status).toBe(503);
  vi.stubEnv("RESEND_API_KEY", "unit-test-provider-key");
  provider.mockImplementation(async () =>
    Response.json({ message: "domain not verified" }, { status: 422 }),
  );
  const { status, data } = await call(input());
  expect(status).toBe(502);
  expect(JSON.stringify(data)).not.toContain("domain not verified");
});
it("limits a burst of sends from one device", async () => {
  const results = [];
  for (let i = 0; i < 32; i++) results.push((await call(input())).status);
  expect(results.filter((s) => s === 200).length).toBe(30);
  expect(results.filter((s) => s === 429).length).toBe(2);
});
