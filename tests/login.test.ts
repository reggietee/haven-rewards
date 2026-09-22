import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { setup } from "../src/lib/engine";
import { login } from "../src/lib/sync";

beforeEach(async () => {
  await db.open();
  await setup();
  vi.stubGlobal("crypto", { subtle: undefined });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete();
});

it("allows a server-verified PIN on LAN HTTP without storing an offline seal or PIN", async () => {
  const expires = Date.now() + 60000;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "server-verified-token",
          expires,
        }),
        { status: 200 },
      ),
    ),
  );
  await login("1122334455");
  const device = await db.device.get("device");
  expect(device?.auth).toBe("server-verified-token");
  expect(device?.authExpires).toBe(expires);
  expect(device?.operatorLock).toBeUndefined();
  expect(JSON.stringify(device)).not.toContain("1122334455");
});

it("requires successful server validation every time on LAN HTTP", async () => {
  await db.device.update("device", {
    auth: "previous-valid-token",
    authExpires: Date.now() + 60000,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
  await expect(login("incorrect-pin")).rejects.toThrow("Unable to unlock");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(login("1122334455")).rejects.toThrow("Unable to unlock");
});
