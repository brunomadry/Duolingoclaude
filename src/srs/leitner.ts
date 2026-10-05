/**
 * Simple Leitner scheduler, the drop-in fallback behind the same Scheduler contract.
 *
 * Box 0 is a new card. Boxes 1 to 5 wait 1, 3, 7, 14 and 30 days.
 * - again: back to box 1, due again in 10 minutes (a lapse unless the card was new)
 * - hard: stays in its box (a new card moves to box 1) and waits that box's interval
 * - good: next box
 * - easy: skips one box
 */
import type { Grade, Scheduler, SrsState } from './types.ts';
import { assertTime, isCount, isDueAt, isTime } from './validate.ts';

export const LEITNER_ALGO = 'leitner';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Interval per box in days; index 0 is the new-card box (due immediately). */
export const LEITNER_INTERVAL_DAYS: readonly number[] = [0, 1, 3, 7, 14, 30];
export const LEITNER_TOP_BOX = LEITNER_INTERVAL_DAYS.length - 1;
/** How soon a forgotten card comes back. */
export const LEITNER_AGAIN_DELAY_MS = 10 * MINUTE;

/** Boxes moved per grade; "hard" stays put but never below box 1. */
const BOX_STEP: Readonly<Record<Exclude<Grade, 'again'>, number>> = { hard: 0, good: 1, easy: 2 };

/** The Leitner-specific shape of SrsState. */
export interface LeitnerSrsState extends SrsState {
  algo: typeof LEITNER_ALGO;
  box: number;
}

function intervalMs(box: number): number {
  return (LEITNER_INTERVAL_DAYS[box] ?? 0) * DAY;
}

/**
 * Validates a Leitner state. Returns null when it was made by another scheduler or is
 * corrupt, so the caller can start over.
 */
export function parseLeitnerState(state: SrsState): LeitnerSrsState | null {
  if (state.algo !== LEITNER_ALGO) return null;
  const { due, reps, lapses, box } = state;
  const lastReview = state.lastReview ?? null;
  if (!isTime(due) || !(lastReview === null || isTime(lastReview))) return null;
  if (!isCount(reps) || !isCount(lapses) || !isCount(box) || box > LEITNER_TOP_BOX) return null;
  return { algo: LEITNER_ALGO, due, lastReview, reps, lapses, box };
}

function newCard(now: number): LeitnerSrsState {
  return { algo: LEITNER_ALGO, due: now, lastReview: null, reps: 0, lapses: 0, box: 0 };
}

export function createLeitnerScheduler(): Scheduler {
  return {
    name: LEITNER_ALGO,

    init(now) {
      assertTime(now);
      return newCard(now);
    },

    review(state, grade, now) {
      assertTime(now);
      const card = parseLeitnerState(state) ?? {
        ...newCard(now),
        // Keep valid counters from a corrupt state so stats survive a reset.
        reps: isCount(state.reps) ? state.reps : 0,
        lapses: isCount(state.lapses) ? state.lapses : 0,
      };
      const base = { algo: LEITNER_ALGO, lastReview: now, reps: card.reps + 1 };
      if (grade === 'again') {
        // As in FSRS, a lapse is forgetting a card that was answered before, not a new one.
        const lapses = card.box > 0 ? card.lapses + 1 : card.lapses;
        return { ...base, lapses, box: 1, due: now + LEITNER_AGAIN_DELAY_MS };
      }
      // hasOwn, not a plain lookup: "constructor" or "toString" would hit Object.prototype.
      if (!Object.hasOwn(BOX_STEP, grade)) throw new RangeError(`Invalid grade: ${String(grade)}`);
      const step = BOX_STEP[grade];
      const box = Math.min(LEITNER_TOP_BOX, Math.max(1, card.box + step));
      return { ...base, lapses: card.lapses, box, due: now + intervalMs(box) };
    },

    isDue(state, now) {
      return isDueAt(state.due, now);
    },
  };
}
