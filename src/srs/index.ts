/**
 * Entry point for spaced repetition. New cards use FSRS; an existing card keeps the
 * scheduler named in its state, so the default can change without migrating cards.
 */
import { FSRS_ALGO, createFsrsScheduler } from './fsrs.ts';
import { LEITNER_ALGO, createLeitnerScheduler } from './leitner.ts';
import type { Grade, Scheduler, SrsState } from './types.ts';

export type { Grade, Scheduler, SrsState } from './types.ts';
export { FSRS_ALGO, FSRS_REQUEST_RETENTION, createFsrsScheduler } from './fsrs.ts';
export { LEITNER_ALGO, createLeitnerScheduler } from './leitner.ts';

/** Intervals capped at a year: the course lasts months, a review per year keeps N5 alive. */
export const fsrsScheduler = createFsrsScheduler({ maximumInterval: 365 });
export const leitnerScheduler = createLeitnerScheduler();

/** The scheduler for new cards (and for states whose algorithm is unknown). */
export const defaultScheduler: Scheduler = fsrsScheduler;

/** Picks the implementation that produced `state`, falling back to the default. */
export function schedulerFor(state: { algo?: unknown } | null | undefined): Scheduler {
  switch (state?.algo) {
    case FSRS_ALGO:
      return fsrsScheduler;
    case LEITNER_ALGO:
      return leitnerScheduler;
    default:
      return defaultScheduler;
  }
}

/** A brand new card state, due immediately. */
export function initCard(now: number): SrsState {
  return defaultScheduler.init(now);
}

/** Whether a card should be reviewed at `now`. Corrupt states count as due so they get repaired. */
export function isCardDue(state: SrsState | undefined, now: number): boolean {
  if (!state || typeof state !== 'object') return true;
  return schedulerFor(state).isDue(state, now);
}

/**
 * Applies one review and never throws on bad data: a missing state starts a new card,
 * and an unknown algorithm or corrupt fields reset the card (keeping valid counters).
 */
export function reviewCard(state: SrsState | undefined, grade: Grade, now: number): SrsState {
  if (!state || typeof state !== 'object') {
    return defaultScheduler.review(defaultScheduler.init(now), grade, now);
  }
  return schedulerFor(state).review(state, grade, now);
}
