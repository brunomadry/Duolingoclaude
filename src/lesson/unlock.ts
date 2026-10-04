/**
 * Lesson unlocking: which lesson comes next and when it opens.
 *
 * Lessons are taken in order and lesson 1 is always open. After lesson N is completed,
 * lesson N + 1 opens at local midnight at the start of the next local calendar day ("daily"
 * pace) or of the day after that ("relaxed" pace), in the profile's IANA time zone. Missed
 * days are never punished: a learner who comes back late finds exactly the next lesson open,
 * never several at once, and nothing is reset.
 *
 * All calendar math goes through Intl.DateTimeFormat with an explicit time zone, never the
 * local Date getters, so results do not depend on the device's own zone and stay exact
 * across DST changes.
 */
import { DEFAULT_TIME_ZONE, TOTAL_LESSONS } from '../shared/constants.ts';

export type Pace = 'daily' | 'relaxed';

export interface LessonCompletion {
  n: number;
  completedAt: number;
}

export interface UnlockInput {
  completions: readonly LessonCompletion[];
  pace: Pace;
  timeZone: string;
  now: number;
  /** Defaults to TOTAL_LESSONS (100). */
  totalLessons?: number;
}

export interface UnlockState {
  /** Distinct lessons in 1..totalLessons completed at least once. */
  completedCount: number;
  /** The lesson after the unbroken run 1..n of completed lessons; null when all are done. */
  nextN: number | null;
  nextUnlocked: boolean;
  /** When nextN opens (epoch ms); null when it is already open or nothing is left. */
  unlocksAt: number | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Lesson unlock state at `now`.
 *
 * The timer runs from the completion of lesson nextN - 1. Storage keeps one record per lesson
 * (the first completion), but if duplicates slip in (a bad merge or import), the latest record
 * for that lesson wins: a stray record can then only delay an unlock, never open a lesson early.
 * Out-of-range, fractional and non-finite records are ignored.
 */
export function computeUnlock(input: UnlockInput): UnlockState {
  const total = input.totalLessons ?? TOTAL_LESSONS;
  const latest = new Map<number, number>();
  for (const { n, completedAt } of input.completions) {
    if (!Number.isInteger(n) || n < 1 || n > total || !Number.isFinite(completedAt)) continue;
    const seen = latest.get(n);
    if (seen === undefined || completedAt > seen) latest.set(n, completedAt);
  }
  const completedCount = latest.size;

  let done = 0;
  while (latest.has(done + 1)) done += 1;
  if (done >= total) return { completedCount, nextN: null, nextUnlocked: false, unlocksAt: null };

  const nextN = done + 1;
  const previous = latest.get(done);
  if (previous === undefined) return { completedCount, nextN, nextUnlocked: true, unlocksAt: null };

  // Anything but 'relaxed' (including a corrupted value) counts as daily.
  const gapDays = input.pace === 'relaxed' ? 2 : 1;
  const { year, month, day } = wallClock(previous, input.timeZone);
  const opensAt = startOfLocalDay(year, month, day + gapDays, input.timeZone);
  return input.now >= opensAt
    ? { completedCount, nextN, nextUnlocked: true, unlocksAt: null }
    : { completedCount, nextN, nextUnlocked: false, unlocksAt: opensAt };
}

/** Local calendar date of an instant in `timeZone`, as "YYYY-MM-DD". */
export function localDayKey(ms: number, timeZone: string): string {
  const { year, month, day } = wallClock(ms, timeZone);
  return dayKey(year, month, day);
}

/**
 * Epoch ms of the first instant of the local calendar day year-month-day (month is 1-12) in
 * `timeZone`: local midnight, or, where midnight does not exist because clocks jump past it
 * (e.g. America/Santiago, 00:00 -> 01:00), the first instant that falls on that day. Where
 * midnight happens twice, the earlier one is returned. Out-of-range parts roll over like
 * Date.UTC (day 32 of December is 1 January of the next year).
 */
export function startOfLocalDay(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): number {
  // The wanted wall clock reading (local midnight), written as if it were UTC.
  const wall = utcFromParts(year, month - 1, day);

  // Fast path: try the UTC offsets in force around that moment; a candidate is valid when the
  // zone really shows `wall` at that instant.
  let best = Number.POSITIVE_INFINITY;
  for (const probe of [wall - DAY, wall, wall + DAY]) {
    const offset = offsetAt(probe, timeZone);
    const candidate = wall - offset;
    if (candidate < best && offsetAt(candidate, timeZone) === offset) best = candidate;
  }
  if (best !== Number.POSITIVE_INFINITY) return best;

  // Midnight falls into a gap: binary search for the first instant on the target date. Real
  // UTC offsets lie within -12:00..+14:00, so the bounds sit before and on/after that date.
  const target = new Date(wall);
  const targetKey = dayKey(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
  let lo = wall - 15 * HOUR;
  let hi = wall + 13 * HOUR;
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (localDayKey(mid, timeZone) >= targetKey) hi = mid;
    else lo = mid;
  }
  return hi;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
  } catch (error) {
    // A zone name this engine does not know (e.g. synced from a newer device): fall back to
    // the default zone instead of breaking every screen that shows the next lesson.
    if (timeZone === DEFAULT_TIME_ZONE) throw error;
    formatter = formatterFor(DEFAULT_TIME_ZONE);
  }
  formatters.set(timeZone, formatter);
  return formatter;
}

function wallClock(ms: number, timeZone: string): WallClock {
  const clock: WallClock = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of formatterFor(timeZone).formatToParts(ms)) {
    if (part.type in clock) clock[part.type as keyof WallClock] = Number(part.value);
  }
  // Some older engines print midnight as hour 24 even with h23.
  clock.hour %= 24;
  return clock;
}

/** UTC offset of `timeZone` at instant `ms`, in ms (local wall clock minus UTC). */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone);
  const wall = utcFromParts(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

/** Date.UTC without its 0-99 => 1900s year mapping. */
function utcFromParts(year: number, monthIndex: number, day: number, h = 0, m = 0, s = 0): number {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(h, m, s, 0);
  return date.getTime();
}

function dayKey(year: number, month: number, day: number): string {
  const pad = (value: number, width: number) => String(value).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}
