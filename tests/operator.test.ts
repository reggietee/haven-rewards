import { expect, it } from "vitest";
import { sealAuthorization, unlockAuthorization } from "../src/lib/operator";
it("seals server authorization for offline PIN unlock without storing the PIN; rejects wrong PIN and token", async () => {
  const token = "test-only-signed-authorization",
    pin = "1122334455";
  const seal = await sealAuthorization(token, pin);
  expect(JSON.stringify(seal)).not.toContain(pin);
  expect(JSON.stringify(seal)).not.toContain(token);
  expect(await unlockAuthorization(seal, pin, token)).toBe(true);
  expect(await unlockAuthorization(seal, "9988776655", token)).toBe(false);
  expect(await unlockAuthorization(seal, pin, "different-authorization")).toBe(
    false,
  );
  const tampered = { ...seal, sealed: seal.sealed.slice(0, -8) + "AAAAAAAA" };
  expect(await unlockAuthorization(tampered, pin, token)).toBe(false);
}, 30000);
