export const TAU = Math.PI * 2;
export const IDLE_REVOLUTION_MS = 90000;
export function idleAdvance(milliseconds: number) {
  return (milliseconds / IDLE_REVOLUTION_MS) * TAU;
}
export function landingRotation(index: number, count: number, from = 0) {
  return Math.ceil(from / TAU) * TAU + TAU * 7 + (index * TAU) / count;
}
export function spinProgress(t: number) {
  t = Math.min(1, Math.max(0, t));
  return 10 * t * t - 20 * t ** 3 + 15 * t ** 4 - 4 * t ** 5;
}
