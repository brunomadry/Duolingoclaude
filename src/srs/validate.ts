/**
 * Shared checks for SRS state read back from IndexedDB or sync, where any field can
 * be missing or corrupt.
 */

/** Largest epoch ms a JS Date can hold (ECMAScript time value range). */
export const MAX_TIME_MS = 8.64e15;

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A non-negative integer counter (reps, lapses, box, step). */
export function isCount(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

/** Epoch ms that a Date can represent; anything else becomes an Invalid Date (NaN). */
export function isTime(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= MAX_TIME_MS;
}

export function assertTime(now: number): void {
  if (!isTime(now)) throw new RangeError(`Invalid review time: ${String(now)}`);
}

/** Whether a stored due time says "review now". A corrupt due counts as due so it gets repaired. */
export function isDueAt(due: unknown, now: number): boolean {
  return !isTime(due) || due <= now;
}
