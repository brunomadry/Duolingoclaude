import { describe, expect, it } from 'vitest';
import {
  defaultScheduler,
  fsrsScheduler,
  initCard,
  isCardDue,
  leitnerScheduler,
  reviewCard,
  schedulerFor,
} from './index.ts';
import type { SrsState } from './types.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const T0 = Date.UTC(2026, 9, 4, 18, 0);

function isValidState(state: SrsState): boolean {
  return (
    typeof state.algo === 'string' &&
    Number.isFinite(state.due) &&
    (state.lastReview === null || Number.isFinite(state.lastReview)) &&
    Number.isInteger(state.reps) &&
    Number.isInteger(state.lapses) &&
    Object.values(state).every(
      (v) => v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)),
    )
  );
}

describe('scheduler selection', () => {
  it('uses FSRS by default', () => {
    expect(defaultScheduler).toBe(fsrsScheduler);
    expect(defaultScheduler.name).toBe('fsrs');
    expect(initCard(T0)).toEqual(fsrsScheduler.init(T0));
  });

  it('picks the implementation from state.algo', () => {
    expect(schedulerFor(fsrsScheduler.init(T0))).toBe(fsrsScheduler);
    expect(schedulerFor(leitnerScheduler.init(T0))).toBe(leitnerScheduler);
  });

  it('falls back to the default for unknown or missing algorithms', () => {
    expect(schedulerFor(undefined)).toBe(defaultScheduler);
    expect(schedulerFor(null)).toBe(defaultScheduler);
    expect(schedulerFor({ algo: 'sm2' })).toBe(defaultScheduler);
    expect(schedulerFor({ algo: 'constructor' })).toBe(defaultScheduler);
    expect(schedulerFor({ algo: 3 })).toBe(defaultScheduler);
  });
});

describe('reviewCard', () => {
  it('starts a new FSRS card when there is no state', () => {
    const next = reviewCard(undefined, 'good', T0);
    expect(next).toEqual(fsrsScheduler.review(fsrsScheduler.init(T0), 'good', T0));
    expect(next.reps).toBe(1);
    expect(next.lastReview).toBe(T0);
  });

  it('keeps each card on the scheduler that produced it', () => {
    const leitner = leitnerScheduler.init(T0);
    expect(reviewCard(leitner, 'good', T0)).toEqual(leitnerScheduler.review(leitner, 'good', T0));
    expect(reviewCard(leitner, 'good', T0).algo).toBe('leitner');
    const fsrs = fsrsScheduler.init(T0);
    expect(reviewCard(fsrs, 'good', T0).algo).toBe('fsrs');
  });

  it('is deterministic across a JSON round trip of the whole history', () => {
    const grades = ['good', 'good', 'again', 'hard', 'good', 'easy'] as const;
    let direct: SrsState | undefined;
    let stored: SrsState | undefined;
    let now = T0;
    for (const grade of grades) {
      direct = reviewCard(direct, grade, now);
      stored = reviewCard(
        stored === undefined ? undefined : (JSON.parse(JSON.stringify(stored)) as SrsState),
        grade,
        now,
      );
      expect(stored).toEqual(direct);
      now = direct.due + DAY;
    }
    expect(direct!.lapses).toBe(1);
  });

  it('recovers from corrupt states instead of throwing', () => {
    const learned = reviewCard(reviewCard(undefined, 'good', T0), 'good', T0 + 10 * MINUTE);
    const corrupt: unknown[] = [
      null,
      {},
      { algo: 'sm2', due: T0, lastReview: null, reps: 3, lapses: 1, ease: 2.5 },
      { ...learned, due: Number.NaN },
      { ...learned, stability: Number.NaN },
      { ...learned, reps: 'many' },
      { ...learned, phase: undefined },
      { algo: 'leitner', due: 'tomorrow', lastReview: null, reps: 0, lapses: 0, box: 2 },
      { algo: 'leitner', due: T0, lastReview: null, reps: 0, lapses: 0 },
      // Memory states ts-fsrs throws on ("Invalid memory state").
      { ...learned, difficulty: 0.5 },
      { ...learned, stability: 0.0001 },
      { ...learned, phase: 'New', stability: -1, difficulty: 0 },
      // Times a Date cannot hold (would give NaN fields).
      { ...learned, lastReview: 1e20 },
      { ...learned, due: -1e20 },
      'garbage',
      42,
      [],
    ];
    for (const state of corrupt) {
      const next = reviewCard(state as SrsState, 'good', T0);
      expect(isValidState(next), JSON.stringify(state)).toBe(true);
      expect(next.lastReview).toBe(T0);
      expect(next.due).toBeGreaterThan(T0);
      // The repaired state reviews normally afterwards.
      expect(isValidState(reviewCard(next, 'again', next.due))).toBe(true);
    }
  });

  it('keeps valid counters when it resets an unknown algorithm', () => {
    const next = reviewCard(
      { algo: 'sm2', due: T0, lastReview: null, reps: 3, lapses: 1 },
      'good',
      T0,
    );
    expect(next.algo).toBe('fsrs');
    expect(next.reps).toBe(4);
    expect(next.lapses).toBe(1);
  });
});

describe('isCardDue', () => {
  it('follows the scheduler and treats missing or corrupt state as due', () => {
    const state = reviewCard(undefined, 'good', T0);
    expect(isCardDue(state, state.due - 1)).toBe(false);
    expect(isCardDue(state, state.due)).toBe(true);
    expect(isCardDue(undefined, T0)).toBe(true);
    expect(isCardDue({ ...state, due: Number.NaN }, T0)).toBe(true);
    expect(isCardDue({ ...state, due: 1e20 }, T0)).toBe(true);
    expect(isCardDue('garbage' as unknown as SrsState, T0)).toBe(true);
  });
});
