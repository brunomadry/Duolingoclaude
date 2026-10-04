import { describe, expect, it } from 'vitest';
import {
  LEITNER_AGAIN_DELAY_MS,
  LEITNER_INTERVAL_DAYS,
  createLeitnerScheduler,
  parseLeitnerState,
} from './leitner.ts';
import type { Grade, SrsState } from './types.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const T0 = Date.UTC(2026, 9, 4, 18, 0);

const leitner = createLeitnerScheduler();

function inBox(box: number, now = T0): SrsState {
  return { algo: 'leitner', due: now, lastReview: now - DAY, reps: box, lapses: 0, box };
}

describe('Leitner scheduler', () => {
  it('has five boxes with intervals of 1, 3, 7, 14 and 30 days', () => {
    expect(LEITNER_INTERVAL_DAYS).toEqual([0, 1, 3, 7, 14, 30]);
    expect(LEITNER_AGAIN_DELAY_MS).toBe(10 * MINUTE);
    expect(leitner.name).toBe('leitner');
  });

  it('creates a new card that is due immediately', () => {
    const state = leitner.init(T0);
    expect(state).toEqual({
      algo: 'leitner',
      due: T0,
      lastReview: null,
      reps: 0,
      lapses: 0,
      box: 0,
    });
    expect(leitner.isDue(state, T0)).toBe(true);
  });

  it('moves up one box per "good" and stays in the top box', () => {
    let state = leitner.init(T0);
    let now = T0;
    const seen: [number, number][] = [];
    for (let i = 0; i < 7; i++) {
      state = leitner.review(state, 'good', now);
      seen.push([state.box as number, (state.due - now) / DAY]);
      now = state.due;
    }
    expect(seen).toEqual([
      [1, 1],
      [2, 3],
      [3, 7],
      [4, 14],
      [5, 30],
      [5, 30],
      [5, 30],
    ]);
    expect(state.reps).toBe(7);
    expect(state.lapses).toBe(0);
  });

  it('skips one box on "easy", capped at the top box', () => {
    expect(leitner.review(leitner.init(T0), 'easy', T0)).toMatchObject({
      box: 2,
      due: T0 + 3 * DAY,
    });
    expect(leitner.review(inBox(2), 'easy', T0)).toMatchObject({ box: 4, due: T0 + 14 * DAY });
    expect(leitner.review(inBox(4), 'easy', T0)).toMatchObject({ box: 5, due: T0 + 30 * DAY });
  });

  it('keeps the box on "hard" and waits that box interval, at least a day', () => {
    expect(leitner.review(inBox(3), 'hard', T0)).toMatchObject({ box: 3, due: T0 + 7 * DAY });
    expect(leitner.review(leitner.init(T0), 'hard', T0)).toMatchObject({
      box: 1,
      due: T0 + DAY,
    });
  });

  it('sends "again" back to box 1 in 10 minutes and counts a lapse', () => {
    const next = leitner.review({ ...inBox(4), lapses: 1 }, 'again', T0);
    expect(next).toMatchObject({ box: 1, due: T0 + 10 * MINUTE, lapses: 2, lastReview: T0 });
    expect(leitner.isDue(next, T0 + 9 * MINUTE)).toBe(false);
    expect(leitner.isDue(next, T0 + 10 * MINUTE)).toBe(true);
  });

  it('does not count a lapse when a new card is missed', () => {
    const next = leitner.review(leitner.init(T0), 'again', T0);
    expect(next).toMatchObject({ box: 1, due: T0 + 10 * MINUTE, lapses: 0, reps: 1 });
  });

  it('is deterministic, pure and JSON-safe', () => {
    const input = Object.freeze(inBox(2));
    for (const grade of ['again', 'hard', 'good', 'easy'] as const) {
      const a = leitner.review(input, grade, T0 + DAY);
      expect(leitner.review(input, grade, T0 + DAY)).toEqual(a);
      const copy = JSON.parse(JSON.stringify(input)) as SrsState;
      expect(leitner.review(copy, grade, T0 + DAY)).toEqual(a);
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    }
    expect(input).toEqual(inBox(2));
  });

  it('has an inclusive isDue boundary', () => {
    const state = leitner.review(leitner.init(T0), 'good', T0);
    expect(leitner.isDue(state, state.due - 1)).toBe(false);
    expect(leitner.isDue(state, state.due)).toBe(true);
    expect(leitner.isDue(state, state.due + 1)).toBe(true);
  });

  it('uses exact durations, independent of the local time zone and DST', () => {
    // Europe/Warsaw switches to summer time at 01:00 UTC on 2026-03-29.
    const before = Date.UTC(2026, 2, 28, 19, 0);
    const next = leitner.review(leitner.init(before), 'good', before);
    expect(next.due).toBe(Date.UTC(2026, 2, 29, 19, 0));
  });

  it('recovers from corrupt states instead of throwing', () => {
    const cases: SrsState[] = [
      { ...inBox(2), box: 9 },
      { ...inBox(2), box: 1.5 },
      { ...inBox(2), due: Number.NaN },
      { ...inBox(2), box: 'three' },
      { ...inBox(2), algo: 'fsrs' },
      { ...inBox(2), reps: Number.POSITIVE_INFINITY },
      // Times a Date cannot hold.
      { ...inBox(2), due: 1e20 },
      { ...inBox(2), lastReview: -1e20 },
    ];
    for (const corrupt of cases) {
      expect(parseLeitnerState(corrupt)).toBeNull();
      const next = leitner.review(corrupt, 'good', T0);
      expect(parseLeitnerState(next)).not.toBeNull();
      expect(next).toMatchObject({ box: 1, due: T0 + DAY, lastReview: T0 });
    }
    // Valid counters survive the reset.
    expect(leitner.review({ ...inBox(3), box: -1, lapses: 4 }, 'good', T0).lapses).toBe(4);
  });

  it('rejects an unknown grade and a non-finite time', () => {
    expect(() => leitner.review(inBox(1), 'meh' as Grade, T0)).toThrow(RangeError);
    expect(() => leitner.review(inBox(1), 'good', Number.NaN)).toThrow(RangeError);
  });

  it('rejects grades named after Object.prototype members instead of writing box NaN', () => {
    for (const grade of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(() => leitner.review(inBox(1), grade as Grade, T0), grade).toThrow(RangeError);
    }
  });

  it('rejects a time outside the Date range', () => {
    expect(() => leitner.init(1e20)).toThrow(RangeError);
    expect(() => leitner.review(inBox(1), 'good', 1e20)).toThrow(RangeError);
  });

  it('treats a due time outside the Date range as due', () => {
    expect(leitner.isDue({ ...inBox(2), due: 1e20 }, T0)).toBe(true);
  });

  it('ignores clock skew: a review before the last one still schedules from now', () => {
    const state = inBox(3);
    const now = state.lastReview! - 3 * DAY;
    expect(leitner.review(state, 'good', now)).toMatchObject({
      box: 4,
      lastReview: now,
      due: now + 14 * DAY,
    });
  });
});
