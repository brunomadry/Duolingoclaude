/**
 * Review queue: which cards the review step shows, and how an answer becomes a grade.
 */
import { isCardDue } from './index.ts';
import type { Grade, SrsState } from './types.ts';
import { isTime } from './validate.ts';

/** Cards per review session: about 3 to 5 minutes, so the review step never snowballs. */
export const REVIEW_SESSION_MAX = 20;

export interface QueueCard {
  cardId: string;
  state: SrsState;
}

export interface ReviewQueue<T extends QueueCard = QueueCard> {
  /** Due cards for this session, most overdue first. */
  queue: T[];
  /** All due cards, including the ones left for a later session. */
  dueTotal: number;
}

/**
 * Sort key: earlier due means more overdue. A corrupt due (the same test the
 * schedulers' isDue uses) sorts first so it gets repaired.
 */
function dueKey(state: SrsState | undefined): number {
  const due: unknown = state && typeof state === 'object' ? state.due : undefined;
  return isTime(due) ? due : Number.NEGATIVE_INFINITY;
}

function sessionCap(max: number | undefined): number {
  if (max === undefined || Number.isNaN(max)) return REVIEW_SESSION_MAX;
  return Math.max(0, Math.floor(max));
}

/**
 * Picks the due cards, most overdue first (ties broken by cardId so the order is
 * stable), capped at `max` (default 20). `dueTotal` counts every due card.
 */
export function buildReviewQueue<T extends QueueCard>(
  cards: readonly T[],
  now: number,
  opts?: { max?: number },
): ReviewQueue<T> {
  const due = cards
    .filter((card) => isCardDue(card.state, now))
    .map((card) => ({ card, key: dueKey(card.state) }));
  due.sort((a, b) => {
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    if (a.card.cardId === b.card.cardId) return 0;
    return a.card.cardId < b.card.cardId ? -1 : 1;
  });
  return {
    queue: due.slice(0, sessionCap(opts?.max)).map((entry) => entry.card),
    dueTotal: due.length,
  };
}

/** Wrong is "again", right but hesitant is "hard", otherwise "good". */
export function gradeFromAnswer({
  correct,
  hesitant = false,
}: {
  correct: boolean;
  hesitant?: boolean;
}): Grade {
  if (!correct) return 'again';
  return hesitant ? 'hard' : 'good';
}
