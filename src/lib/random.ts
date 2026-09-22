export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // LAN HTTP previews lack randomUUID, but still provide secure random bytes.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function randomInt(max: number): number {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000)
    throw new Error("Invalid random range");
  const limit = 0x100000000 - (0x100000000 % max);
  const a = new Uint32Array(1);
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= limit);
  return a[0] % max;
}
export function shuffled<T>(input: T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function prizeCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const s = Array.from(
    { length: 8 },
    () => alphabet[randomInt(alphabet.length)],
  ).join("");
  return `HAVEN-${s.slice(0, 4)}-${s.slice(4)}`;
}
