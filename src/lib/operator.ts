/** Runtime authorization seal, never a bundled PIN or client-side PIN hash.
 * Created only after successful server authentication; keeps offline controls PIN-gated. */
export interface OperatorLock {
  salt: string;
  iv: string;
  sealed: string;
  iterations: 600000;
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export const supportsOfflineUnlock = () => !!globalThis.crypto?.subtle;
async function key(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function sealAuthorization(
  token: string,
  pin: string,
): Promise<OperatorLock> {
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(pin, salt, 600000),
    new TextEncoder().encode(token),
  );
  return {
    salt: encode(salt),
    iv: encode(iv),
    sealed: encode(new Uint8Array(sealed)),
    iterations: 600000,
  };
}
export async function unlockAuthorization(
  lock: OperatorLock,
  pin: string,
  expectedToken: string,
) {
  try {
    if (lock.iterations !== 600000) return false;
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(lock.iv) },
      await key(pin, decode(lock.salt), lock.iterations),
      decode(lock.sealed),
    );
    return new TextDecoder().decode(clear) === expectedToken;
  } catch {
    return false;
  }
}
