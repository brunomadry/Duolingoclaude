/**
 * Spaced repetition contract. The app only talks to `Scheduler`, so FSRS (default)
 * can be swapped for the simple Leitner implementation without touching callers.
 * All state is JSON-safe (numbers and strings only) because it is stored in
 * IndexedDB and synced as CardRecord.data.
 */

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface SrsState {
  /** Which scheduler produced this state ("fsrs" | "leitner"). */
  algo: string;
  /** Epoch ms when the card is next due. */
  due: number;
  /** Epoch ms of the last review, null for a new card. */
  lastReview: number | null;
  reps: number;
  lapses: number;
  /** Scheduler-specific fields (numbers/strings only). */
  [key: string]: string | number | null;
}

export interface Scheduler {
  readonly name: string;
  /** A brand new card, due immediately. */
  init(now: number): SrsState;
  /** Applies a review. Must be pure: same input, same output. */
  review(state: SrsState, grade: Grade, now: number): SrsState;
  isDue(state: SrsState, now: number): boolean;
}
