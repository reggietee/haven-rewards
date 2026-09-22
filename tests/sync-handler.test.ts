import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "../server/http";
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("google-auth-library", () => ({
  JWT: class {
    request = mock.request;
  },
}));
import handler from "../api/sync";
import { issueToken } from "../server/auth";
let deviceId: string;
let values: Map<string, unknown[][]>;
let responseLost: boolean;
beforeEach(() => {
  deviceId = crypto.randomUUID();
  vi.stubEnv("SESSION_SECRET", "test-only");
  vi.stubEnv("KIOSK_DEVICE_ID", deviceId);
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "test@example.com");
  vi.stubEnv("GOOGLE_PRIVATE_KEY", "test-key");
  vi.stubEnv("GOOGLE_SHEET_ID", "test-sheet");
  values = new Map();
  responseLost = true;
  mock.request.mockReset();
  mock.request.mockImplementation(
    async (config: {
      url: string;
      params?: { ranges: string[] };
      data?: {
        data: { range: string; values: unknown[][] }[];
        valueInputOption: string;
      };
    }) => {
      if (config.url.includes("values:batchGet"))
        return {
          data: {
            valueRanges: config.params!.ranges.map((r) => ({
              values: values
                .get(r.replace(/:C(\d+)/, ":S$1"))
                ?.map((row) => row.slice(0, 3)),
            })),
          },
        };
      if (config.url.includes("Excluded"))
        return {
          data: {
            values: [["restricted", "sample@example.com", "", "", "true"]],
          },
        };
      if (config.url.includes("values:batchUpdate")) {
        expect(config.data?.valueInputOption).toBe("RAW");
        for (const d of config.data!.data) values.set(d.range, d.values);
        if (responseLost) {
          responseLost = false;
          throw new Error("Simulated lost response after successful write");
        }
        return { data: {} };
      }
      throw new Error("Unexpected request");
    },
  );
});
afterEach(() => vi.unstubAllEnvs());
async function call(records: unknown[]) {
  let status = 200;
  let body: unknown;
  const response = {
    setHeader: vi.fn(),
    status(n: number) {
      status = n;
      return response;
    },
    json(v: unknown) {
      body = v;
      return response;
    },
    end() {
      return response;
    },
  };
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer " + issueToken(deviceId).token },
      body: { version: 1, deviceId, records },
    } as VercelRequest,
    response as unknown as VercelResponse,
  );
  return { status, body };
}
it("retries a Google write with a lost response into the same row, never exposes excluded status", async () => {
  const record = {
    seq: 1,
    id: crypto.randomUUID(),
    version: 1,
    tab: "Entries",
    createdAt: new Date().toISOString(),
    record: {
      id: crypto.randomUUID(),
      first: "Sample",
      last: "Guest",
      email: "sample@example.com",
      ageAccepted: true,
      rulesVersion: "1",
    },
  };
  expect((await call([record])).status).toBe(503);
  expect(values.size).toBe(2);
  const retry = await call([record]);
  expect(retry.status).toBe(200);
  expect(retry.body).toEqual({ accepted: [record.id] });
  expect(values.size).toBe(2);
  expect(values.get("'Excluded'!G2:L2")?.[0][3]).toBe("REVIEW");
  const again = await call([record]);
  expect(again.body).toEqual(retry.body);
  expect(values.size).toBe(2);
  const original = values.get("'Entries'!A2:S2");
  expect(
    (
      await call([
        { ...record, record: { ...record.record, first: "Altered" } },
      ])
    ).status,
  ).toBe(200);
  expect(values.get("'Entries'!A2:S2")).toEqual(original);
});
it("rejects an occupied row owned by another record instead of overwriting", async () => {
  values.set("'Audit'!A2:S2", [["different-uuid", 1, deviceId]]);
  const result = await call([
    {
      seq: 1,
      id: crypto.randomUUID(),
      version: 1,
      tab: "Audit",
      createdAt: new Date().toISOString(),
      record: { id: crypto.randomUUID() },
    },
  ]);
  expect(result.status).toBe(409);
  expect(values.get("'Audit'!A2:S2")?.[0][0]).toBe("different-uuid");
});
