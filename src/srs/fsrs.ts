/**
 * FSRS scheduler (the default), backed by ts-fsrs.
 *
 * Fuzz is off, so a review is a pure function of (state, grade, now): the same input
 * always gives the same output. (Across JS engines the last bits of Math.exp/pow may
 * differ; that is harmless because devices sync whole states, they never replay reviews.)
 * The ts-fsrs Card is flattened into a JSON-safe SrsState (dates as epoch ms).
 * Elapsed time inside ts-fsrs is counted in UTC calendar days, not 24 h periods.
 */
import {
  Rating,
  S_MAX,
  S_MIN,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type FSRSParameters,
  type Grade as FsrsGrade,
  type StateType,
} from 'ts-fsrs';
import type { Grade, Scheduler, SrsState } from './types.ts';
import { assertTime, isCount, isDueAt, isFiniteNumber, isTime } from './validate.ts';

export const FSRS_ALGO = 'fsrs';

/** Desired retention from the brief: a card comes back when recall drops to about 90%. */
export const FSRS_REQUEST_RETENTION = 0.9;

export interface FsrsOptions {
  /** Desired retention in (0, 1). Defaults to 0.9. */
  requestRetention?: number;
  /** Longest interval in whole days (at least 1). Defaults to the ts-fsrs default. */
  maximumInterval?: number;
  /** Use short (re)learning steps in minutes before a card graduates. Defaults to true. */
  enableShortTerm?: boolean;
}

export interface FsrsScheduler extends Scheduler {
  /** The effective ts-fsrs parameters (read-only copy, for tests and diagnostics). */
  readonly parameters: Readonly<FSRSParameters>;
}

/** The FSRS-specific shape of SrsState. */
export interface FsrsSrsState extends SrsState {
  algo: typeof FSRS_ALGO;
  /** ts-fsrs learning state. */
  phase: StateType;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
}

const RATING: Readonly<Record<Grade, FsrsGrade>> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const PHASE_BY_STATE: Readonly<Record<State, StateType>> = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning',
};

const STATE_BY_PHASE: Readonly<Record<StateType, State>> = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
};

function isPhase(value: unknown): value is StateType {
  return typeof value === 'string' && Object.hasOwn(STATE_BY_PHASE, value);
}

/**
 * Whether ts-fsrs accepts this memory state. Anything else makes `next()` throw
 * ("Invalid memory state") or return NaN, so it is treated as corrupt.
 * - A reviewed card needs difficulty in [1, 10] and stability in [S_MIN, S_MAX],
 *   the ranges ts-fsrs itself clamps to.
 * - A new card has no memory yet (both 0), or a valid one.
 */
function isMemoryState(state: State, stability: number, difficulty: number): boolean {
  const valid = difficulty >= 1 && difficulty <= 10 && stability >= S_MIN && stability <= S_MAX;
  if (state === State.New) return valid || (stability === 0 && difficulty === 0);
  return valid;
}

function ratingFor(grade: Grade): FsrsGrade {
  if (!Object.hasOwn(RATING, grade)) throw new RangeError(`Invalid grade: ${String(grade)}`);
  return RATING[grade];
}

function checkOptions(options: FsrsOptions): void {
  const { requestRetention, maximumInterval } = options;
  // ts-fsrs silently swaps 0/NaN for its defaults and accepts a negative or fractional
  // maximum interval (a negative one schedules cards in the past), so reject them here.
  if (
    requestRetention !== undefined &&
    !(isFiniteNumber(requestRetention) && requestRetention > 0 && requestRetention < 1)
  ) {
    throw new RangeError(`Invalid requestRetention: ${String(requestRetention)}`);
  }
  if (maximumInterval !== undefined && !(isCount(maximumInterval) && maximumInterval >= 1)) {
    throw new RangeError(`Invalid maximumInterval: ${String(maximumInterval)}`);
  }
}

/** Flattens a ts-fsrs Card into a JSON-safe SrsState. */
export function fsrsCardToState(card: Card): FsrsSrsState {
  return {
    algo: FSRS_ALGO,
    due: card.due.getTime(),
    lastReview: card.last_review ? card.last_review.getTime() : null,
    reps: card.reps,
    lapses: card.lapses,
    phase: PHASE_BY_STATE[card.state],
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
  };
}

/**
 * Rebuilds a ts-fsrs Card from an SrsState. Returns null when the state was not made
 * by FSRS or is corrupt (missing or non-finite fields), so callers can start over.
 */
export function stateToFsrsCard(state: SrsState): Card | null {
  if (state.algo !== FSRS_ALGO) return null;
  const { due, reps, lapses, phase, stability, difficulty, scheduledDays, learningSteps } = state;
  const lastReview = state.lastReview ?? null;
  // Out-of-range times would become Invalid Dates and turn the result into NaN.
  if (!isTime(due) || !(lastReview === null || isTime(lastReview))) return null;
  if (!isCount(reps) || !isCount(lapses) || !isCount(learningSteps)) return null;
  if (!isPhase(phase) || !isFiniteNumber(scheduledDays) || scheduledDays < 0) return null;
  if (!isFiniteNumber(stability) || !isFiniteNumber(difficulty)) return null;
  const cardState = STATE_BY_PHASE[phase];
  if (!isMemoryState(cardState, stability, difficulty)) return null;
  return {
    due: new Date(due),
    stability,
    difficulty,
    // Deprecated in ts-fsrs and recomputed from last_review on every review.
    elapsed_days: 0,
    scheduled_days: scheduledDays,
    learning_steps: learningSteps,
    reps,
    lapses,
    state: cardState,
    last_review: lastReview === null ? undefined : new Date(lastReview),
  };
}

function emptyCard(now: number): Card {
  // Pass a Date: createEmptyCard treats a falsy number (epoch 0) as "use the clock".
  return createEmptyCard(new Date(now));
}

/** Keeps valid counters from a corrupt state so stats survive a reset. */
function recoverCounters(state: SrsState, card: Card): Card {
  return {
    ...card,
    reps: isCount(state.reps) ? state.reps : 0,
    lapses: isCount(state.lapses) ? state.lapses : 0,
  };
}

export function createFsrsScheduler(options: FsrsOptions = {}): FsrsScheduler {
  checkOptions(options);
  const parameters = generatorParameters({
    request_retention: options.requestRetention ?? FSRS_REQUEST_RETENTION,
    // Deterministic reviews: no random interval fuzz.
    enable_fuzz: false,
    enable_short_term: options.enableShortTerm ?? true,
    ...(options.maximumInterval === undefined ? {} : { maximum_interval: options.maximumInterval }),
  });
  const engine = fsrs(parameters);

  return {
    name: FSRS_ALGO,
    parameters: Object.freeze({ ...parameters }),

    init(now) {
      assertTime(now);
      return fsrsCardToState(emptyCard(now));
    },

    review(state, grade, now) {
      assertTime(now);
      const rating = ratingFor(grade);
      let card = stateToFsrsCard(state) ?? recoverCounters(state, emptyCard(now));
      // A clock behind the last review (another device, manual change) gives a negative
      // elapsed time, which ts-fsrs rejects with an error once it spans a UTC day
      // boundary; treat it as "just reviewed".
      if (card.last_review && card.last_review.getTime() > now) {
        card = { ...card, last_review: new Date(now) };
      }
      return fsrsCardToState(engine.next(card, new Date(now), rating).card);
    },

    isDue(state, now) {
      return isDueAt(state.due, now);
    },
  };
}
