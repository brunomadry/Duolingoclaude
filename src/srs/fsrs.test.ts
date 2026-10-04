import { S_MAX, S_MIN } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import {
  FSRS_REQUEST_RETENTION,
  createFsrsScheduler,
  fsrsCardToState,
  stateToFsrsCard,
} from './fsrs.ts';
import type { Grade, SrsState } from './types.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 4, 18, 0); // 2026-10-04 20:00 in Warsaw

const scheduler = createFsrsScheduler();

function expectJsonSafe(state: SrsState): void {
  for (const [key, value] of Object.entries(state)) {
    const ok =
      value === null ||
      typeof value === 'string' ||
      (typeof value === 'number' && Number.isFinite(value));
    expect(ok, `${key} = ${String(value)}`).toBe(true);
  }
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
}

/** Reviews at each due time with the same grade and returns the visited states. */
function chain(grade: Grade, times: number, start = T0): SrsState[] {
  const states: SrsState[] = [];
  let state = scheduler.init(start);
  let now = start;
  for (let i = 0; i < times; i++) {
    state = scheduler.review(state, grade, now);
    states.push(state);
    now = state.due;
  }
  return states;
}

/** A card that has graduated to the Review phase. */
function reviewCardState(): SrsState {
  const states = chain('good', 3);
  const last = states.at(-1)!;
  expect(last.phase).toBe('Review');
  return last;
}

describe('FSRS parameters', () => {
  it('uses the desired retention of 0.9 from the brief', () => {
    expect(FSRS_REQUEST_RETENTION).toBe(0.9);
    expect(scheduler.parameters.request_retention).toBe(0.9);
  });

  it('disables fuzz so reviews are deterministic, and keeps short-term steps', () => {
    expect(scheduler.parameters.enable_fuzz).toBe(false);
    expect(scheduler.parameters.enable_short_term).toBe(true);
    expect(scheduler.name).toBe('fsrs');
  });

  it('accepts options', () => {
    const custom = createFsrsScheduler({ requestRetention: 0.85, maximumInterval: 365 });
    expect(custom.parameters.request_retention).toBe(0.85);
    expect(custom.parameters.maximum_interval).toBe(365);
    expect(custom.parameters.enable_fuzz).toBe(false);
  });

  it('rejects options that ts-fsrs would silently replace or misuse', () => {
    // ts-fsrs turns 0 and NaN into its defaults, and a negative cap schedules cards in the past.
    for (const requestRetention of [0, 1, -0.5, 1.5, Number.NaN]) {
      expect(() => createFsrsScheduler({ requestRetention }), String(requestRetention)).toThrow(
        RangeError,
      );
    }
    for (const maximumInterval of [0, -5, 0.5, Number.POSITIVE_INFINITY]) {
      expect(() => createFsrsScheduler({ maximumInterval }), String(maximumInterval)).toThrow(
        RangeError,
      );
    }
  });

  it('caps intervals with maximumInterval (ts-fsrs keeps good and easy apart by a day each)', () => {
    const capped = createFsrsScheduler({ maximumInterval: 30 });
    let state = capped.init(T0);
    let now = T0;
    for (let i = 0; i < 12; i++) {
      state = capped.review(state, 'good', now);
      expect(state.scheduledDays).toBeLessThanOrEqual(31);
      expect(state.due - now).toBeLessThanOrEqual(31 * DAY);
      now = state.due;
    }
  });

  it('works without short-term steps', () => {
    const longTerm = createFsrsScheduler({ enableShortTerm: false });
    expect(longTerm.parameters.enable_short_term).toBe(false);
    const first = longTerm.review(longTerm.init(T0), 'good', T0);
    expect(first.phase).toBe('Review');
    expect(first.due - T0).toBeGreaterThanOrEqual(DAY);
    const missed = longTerm.review(first, 'again', first.due);
    expect(missed.lapses).toBe(1);
    expect(missed.due).toBeGreaterThan(first.due);
    expectJsonSafe(missed);
  });
});

describe('FSRS init', () => {
  it('creates a new card that is due immediately', () => {
    const state = scheduler.init(T0);
    expect(state).toMatchObject({
      algo: 'fsrs',
      due: T0,
      lastReview: null,
      reps: 0,
      lapses: 0,
      phase: 'New',
    });
    expect(scheduler.isDue(state, T0)).toBe(true);
    expectJsonSafe(state);
  });

  it('honours epoch 0 instead of reading the clock', () => {
    expect(scheduler.init(0).due).toBe(0);
  });

  it('rejects a non-finite time', () => {
    expect(() => scheduler.init(Number.NaN)).toThrow(RangeError);
    expect(() => scheduler.review(scheduler.init(T0), 'good', Number.NaN)).toThrow(RangeError);
  });

  it('rejects a time outside the Date range instead of returning NaN fields', () => {
    expect(() => scheduler.init(1e20)).toThrow(RangeError);
    expect(() => scheduler.review(scheduler.init(T0), 'good', 1e20)).toThrow(RangeError);
    expect(() => scheduler.review(scheduler.init(T0), 'good', -1e20)).toThrow(RangeError);
  });
});

describe('FSRS review', () => {
  it('is deterministic and pure', () => {
    const input = Object.freeze(reviewCardState());
    const now = input.due + 3 * DAY;
    for (const grade of ['again', 'hard', 'good', 'easy'] as const) {
      const a = scheduler.review(input, grade, now);
      const b = scheduler.review(input, grade, now);
      const c = createFsrsScheduler().review({ ...input }, grade, now);
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    }
  });

  it('gives the same result after a JSON round trip', () => {
    const state = reviewCardState();
    expectJsonSafe(state);
    const copy = JSON.parse(JSON.stringify(state)) as SrsState;
    const now = state.due + DAY;
    expect(scheduler.review(copy, 'good', now)).toEqual(scheduler.review(state, 'good', now));
    expect(scheduler.isDue(copy, now)).toBe(scheduler.isDue(state, now));
  });

  it('keeps due, lastReview, reps and lapses as top-level fields', () => {
    const state = scheduler.review(scheduler.init(T0), 'good', T0);
    expect(state.lastReview).toBe(T0);
    expect(state.reps).toBe(1);
    expect(state.lapses).toBe(0);
    expect(state.due).toBeGreaterThan(T0);
    expectJsonSafe(state);
  });

  it('grows the interval with consecutive "good" reviews', () => {
    const states = chain('good', 8);
    const intervals = states.map((s) => s.due - s.lastReview!);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]!);
    }
    expect(states.at(-1)!.reps).toBe(8);
    // After graduating, intervals are whole days.
    expect(intervals.at(-1)! % DAY).toBe(0);
    expect(intervals.at(-1)!).toBeGreaterThan(30 * DAY);
  });

  it('schedules "again" soon and counts a lapse on a learned card', () => {
    const learned = reviewCardState();
    const now = learned.due;
    const next = scheduler.review(learned, 'again', now);
    expect(next.due - now).toBeLessThanOrEqual(10 * MINUTE);
    expect(next.due).toBeGreaterThan(now);
    expect(next.lapses).toBe(learned.lapses + 1);
    expect(next.reps).toBe(learned.reps + 1);
    expect(next.phase).toBe('Relearning');
  });

  it('does not count a lapse when a new card is missed', () => {
    const next = scheduler.review(scheduler.init(T0), 'again', T0);
    expect(next.lapses).toBe(0);
    expect(next.due - T0).toBeLessThanOrEqual(10 * MINUTE);
  });

  it('orders intervals again < hard < good < easy for a learned card', () => {
    const learned = reviewCardState();
    const now = learned.due;
    const [again, hard, good, easy] = (['again', 'hard', 'good', 'easy'] as const).map(
      (g) => scheduler.review(learned, g, now).due,
    );
    expect(again).toBeLessThan(hard!);
    expect(hard).toBeLessThan(good!);
    expect(good).toBeLessThan(easy!);
  });

  it('treats a review time before the last review as "just reviewed"', () => {
    const learned = reviewCardState();
    const skewed = scheduler.review(learned, 'good', learned.lastReview! - 5 * DAY);
    const sameMoment = scheduler.review(learned, 'good', learned.lastReview!);
    expect(skewed.stability).toBe(sameMoment.stability);
    expect(skewed.difficulty).toBe(sameMoment.difficulty);
  });

  it('survives clock skew in every phase and grade (ts-fsrs throws on negative days)', () => {
    const learning = scheduler.review(scheduler.init(T0), 'good', T0);
    const relearning = scheduler.review(reviewCardState(), 'again', reviewCardState().due);
    expect(learning.phase).toBe('Learning');
    expect(relearning.phase).toBe('Relearning');
    for (const state of [learning, reviewCardState(), relearning]) {
      // Earlier on the same UTC day, and one or more UTC days earlier.
      for (const back of [MINUTE, DAY, 40 * DAY]) {
        const now = state.lastReview! - back;
        for (const grade of ['again', 'hard', 'good', 'easy'] as const) {
          const next = scheduler.review(state, grade, now);
          expectJsonSafe(next);
          expect(next.lastReview).toBe(now);
          expect(next.due).toBeGreaterThan(now);
          expect(next.reps).toBe(state.reps + 1);
        }
      }
    }
  });

  it('uses whole 24 h days across a DST change, independent of the local time zone', () => {
    // Europe/Warsaw goes back to winter time at 01:00 UTC on 2026-10-25.
    const learned = reviewCardState();
    const now = Date.UTC(2026, 9, 24, 21, 30);
    const next = scheduler.review(learned, 'good', now);
    expect(next.scheduledDays).toBeGreaterThan(1);
    expect(next.due - now).toBe((next.scheduledDays as number) * DAY);
  });

  it('handles a very overdue card', () => {
    const learned = reviewCardState();
    const now = learned.due + 20 * 365 * DAY;
    const good = scheduler.review(learned, 'good', now);
    const again = scheduler.review(learned, 'again', now);
    expectJsonSafe(good);
    expectJsonSafe(again);
    expect(good.due).toBeGreaterThan(now + DAY);
    expect(again.lapses).toBe(learned.lapses + 1);
    expect(again.due - now).toBeLessThanOrEqual(10 * MINUTE);
  });

  it('rejects an unknown grade with a RangeError, including Object.prototype names', () => {
    const state = reviewCardState();
    for (const grade of ['meh', 'constructor', 'toString', '__proto__', 'Again']) {
      expect(() => scheduler.review(state, grade as Grade, state.due), grade).toThrow(RangeError);
    }
  });

  it('never throws or emits NaN over long random histories, skewed clocks included', () => {
    // Small deterministic PRNG (mulberry32) so failures are reproducible.
    let seed = 0x5eed;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const grades = ['again', 'hard', 'good', 'easy'] as const;
    let skewed = 0;
    for (let run = 0; run < 40; run++) {
      let state = scheduler.init(T0);
      for (let step = 0; step < 40; step++) {
        const r = random();
        const last = state.lastReview ?? state.due;
        // Mostly on time or late, sometimes early, sometimes before the last review.
        const now = Math.round(
          r < 0.15
            ? last - random() * 3 * DAY
            : r < 0.3
              ? state.due - random() * HOUR
              : state.due + random() * 60 * DAY,
        );
        if (now < last) skewed++;
        const grade = grades[Math.floor(random() * grades.length)]!;
        const next = scheduler.review(state, grade, now);
        expectJsonSafe(next);
        expect(stateToFsrsCard(next), JSON.stringify(next)).not.toBeNull();
        expect(next.due).toBeGreaterThan(now);
        expect(next.reps).toBe(state.reps + 1);
        state = next;
      }
    }
    expect(skewed).toBeGreaterThan(100);
  });
});

describe('FSRS isDue', () => {
  it('is due from the due time on', () => {
    const state = reviewCardState();
    expect(scheduler.isDue(state, state.due - 1)).toBe(false);
    expect(scheduler.isDue(state, state.due)).toBe(true);
    expect(scheduler.isDue(state, state.due + 1)).toBe(true);
  });

  it('treats a corrupt due as due, so the card gets repaired', () => {
    expect(scheduler.isDue({ ...scheduler.init(T0), due: Number.NaN }, T0)).toBe(true);
  });
});

describe('FSRS serialization', () => {
  it('round-trips a card through SrsState', () => {
    const state = reviewCardState();
    const card = stateToFsrsCard(state);
    expect(card).not.toBeNull();
    expect(fsrsCardToState(card!)).toEqual(state);
  });

  it('rejects states from another scheduler or with corrupt fields', () => {
    const good = reviewCardState();
    expect(stateToFsrsCard({ ...good, algo: 'leitner' })).toBeNull();
    expect(stateToFsrsCard({ ...good, due: Number.NaN })).toBeNull();
    expect(stateToFsrsCard({ ...good, stability: 'x' })).toBeNull();
    expect(stateToFsrsCard({ ...good, stability: 0 })).toBeNull();
    expect(stateToFsrsCard({ ...good, phase: 'Graduated' })).toBeNull();
    expect(stateToFsrsCard({ ...good, reps: -1 })).toBeNull();
    expect(stateToFsrsCard({ ...good, lastReview: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('rejects memory states that ts-fsrs would throw on or turn into NaN', () => {
    const good = reviewCardState();
    const fresh = scheduler.init(T0);
    const corrupt: SrsState[] = [
      // ts-fsrs throws "Invalid memory state" when difficulty < 1 or stability < S_MIN.
      { ...good, difficulty: 0.5 },
      { ...good, stability: S_MIN / 10 },
      { ...good, difficulty: 11 },
      { ...good, stability: S_MAX * 2 },
      { ...fresh, stability: -1 },
      { ...fresh, difficulty: 0.5 },
      // Times a Date cannot hold become Invalid Dates and NaN fields.
      { ...good, lastReview: 1e20 },
      { ...good, lastReview: -1e20 },
      { ...good, due: 1e20 },
    ];
    for (const state of corrupt) {
      expect(stateToFsrsCard(state), JSON.stringify(state)).toBeNull();
      for (const grade of ['again', 'hard', 'good', 'easy'] as const) {
        const next = scheduler.review(state, grade, T0 + DAY);
        expectJsonSafe(next);
        expect(stateToFsrsCard(next)).not.toBeNull();
        expect(next.reps).toBe(state.reps + 1);
      }
    }
    // The edges of the valid ranges are still accepted.
    expect(stateToFsrsCard({ ...good, difficulty: 1, stability: S_MIN })).not.toBeNull();
    expect(stateToFsrsCard({ ...good, difficulty: 10, stability: S_MAX })).not.toBeNull();
    expect(stateToFsrsCard({ ...fresh, difficulty: 5, stability: 5 })).not.toBeNull();
  });

  it('treats a due time outside the Date range as due', () => {
    expect(scheduler.isDue({ ...reviewCardState(), due: 1e20 }, T0)).toBe(true);
  });

  it('recovers from a corrupt state instead of throwing, keeping valid counters', () => {
    const corrupt: SrsState = {
      ...reviewCardState(),
      stability: Number.NaN,
      lapses: 2,
    };
    const next = scheduler.review(corrupt, 'good', T0);
    expectJsonSafe(next);
    expect(stateToFsrsCard(next)).not.toBeNull();
    expect(next.lapses).toBe(2);
    expect(next.lastReview).toBe(T0);
  });
});
