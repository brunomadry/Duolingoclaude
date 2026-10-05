import { describe, expect, it } from 'vitest';
import { fsrsScheduler, leitnerScheduler } from './index.ts';
import { REVIEW_SESSION_MAX, buildReviewQueue, gradeFromAnswer } from './queue.ts';
import type { SrsState } from './types.ts';

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 9, 4, 18, 0);

function card(cardId: string, due: number, algo = 'fsrs'): { cardId: string; state: SrsState } {
  const base = algo === 'leitner' ? leitnerScheduler.init(due) : fsrsScheduler.init(due);
  return { cardId, state: { ...base, due } };
}

describe('buildReviewQueue', () => {
  it('returns only due cards, most overdue first', () => {
    const cards = [
      card('k:a', NOW - 1 * MINUTE),
      card('k:b', NOW + 1),
      card('k:c', NOW - 60 * MINUTE),
      card('k:d', NOW),
      card('k:e', NOW - 5 * MINUTE, 'leitner'),
    ];
    const { queue, dueTotal } = buildReviewQueue(cards, NOW);
    expect(queue.map((c) => c.cardId)).toEqual(['k:c', 'k:e', 'k:a', 'k:d']);
    expect(dueTotal).toBe(4);
  });

  it('breaks ties by cardId, independent of input order', () => {
    const ids = ['k:ん', 'k:a', 'k:B', 'k:あ', 'k:b'];
    const cards = ids.map((id) => card(id, NOW - MINUTE));
    const forward = buildReviewQueue(cards, NOW).queue.map((c) => c.cardId);
    const backward = buildReviewQueue([...cards].reverse(), NOW).queue.map((c) => c.cardId);
    expect(forward).toEqual(['k:B', 'k:a', 'k:b', 'k:あ', 'k:ん']);
    expect(backward).toEqual(forward);
  });

  it('caps the session at 20 cards by default and reports every due card', () => {
    expect(REVIEW_SESSION_MAX).toBe(20);
    const cards = Array.from({ length: 35 }, (_, i) =>
      card(`k:${String(i).padStart(2, '0')}`, NOW - i * MINUTE),
    );
    const { queue, dueTotal } = buildReviewQueue(cards, NOW);
    expect(queue).toHaveLength(20);
    expect(dueTotal).toBe(35);
    expect(queue[0]!.cardId).toBe('k:34');
    expect(queue.at(-1)!.cardId).toBe('k:15');
  });

  it('honours a custom cap', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(`k:${i}`, NOW - i * MINUTE));
    expect(buildReviewQueue(cards, NOW, { max: 3 }).queue).toHaveLength(3);
    expect(buildReviewQueue(cards, NOW, { max: 0 })).toEqual({ queue: [], dueTotal: 10 });
    expect(buildReviewQueue(cards, NOW, { max: 50 }).queue).toHaveLength(10);
    expect(buildReviewQueue(cards, NOW, { max: undefined }).queue).toHaveLength(10);
    expect(buildReviewQueue(cards, NOW, { max: -3 }).queue).toHaveLength(0);
    expect(buildReviewQueue(cards, NOW, { max: 2.9 }).queue).toHaveLength(2);
    expect(buildReviewQueue(cards, NOW, { max: Number.NaN }).queue).toHaveLength(10);
  });

  it('handles an empty list and a list with nothing due', () => {
    expect(buildReviewQueue([], NOW)).toEqual({ queue: [], dueTotal: 0 });
    expect(buildReviewQueue([card('k:a', NOW + MINUTE)], NOW)).toEqual({ queue: [], dueTotal: 0 });
  });

  it('puts corrupt states first so they get repaired', () => {
    const corrupt = { cardId: 'k:z', state: { ...fsrsScheduler.init(NOW), due: Number.NaN } };
    const { queue } = buildReviewQueue([card('k:a', NOW - MINUTE), corrupt], NOW);
    expect(queue.map((c) => c.cardId)).toEqual(['k:z', 'k:a']);
  });

  it('treats every kind of corrupt state as due and first, consistently with isDue', () => {
    const corrupt: { cardId: string; state: SrsState }[] = [
      // A due a Date cannot hold: due (isDue) and sorted first, not last.
      { cardId: 'k:y', state: { ...fsrsScheduler.init(NOW), due: 1e20 } },
      { cardId: 'k:x', state: { ...leitnerScheduler.init(NOW), due: 'tomorrow' as never } },
      { cardId: 'k:w', state: undefined as unknown as SrsState },
      { cardId: 'k:v', state: 'garbage' as unknown as SrsState },
    ];
    const cards = [card('k:a', NOW - 60 * MINUTE), ...corrupt];
    const { queue, dueTotal } = buildReviewQueue(cards, NOW);
    expect(dueTotal).toBe(5);
    expect(queue.map((c) => c.cardId)).toEqual(['k:v', 'k:w', 'k:x', 'k:y', 'k:a']);
  });

  it('orders mixed schedulers by due time alone', () => {
    const cards = [
      card('k:a', NOW - 2 * MINUTE, 'leitner'),
      card('k:b', NOW - 3 * MINUTE),
      card('k:c', NOW - 2 * MINUTE),
      card('k:d', NOW - 3 * MINUTE, 'leitner'),
    ];
    const ids = buildReviewQueue(cards, NOW).queue.map((c) => c.cardId);
    expect(ids).toEqual(['k:b', 'k:d', 'k:a', 'k:c']);
  });

  it('keeps the caller objects and does not mutate the input', () => {
    const cards = Object.freeze([
      { ...card('k:b', NOW - MINUTE), extra: 1 },
      { ...card('k:a', NOW - MINUTE), extra: 2 },
    ]);
    const { queue } = buildReviewQueue(cards, NOW);
    expect(queue[0]).toBe(cards[1]);
    expect(queue[0]!.extra).toBe(2);
    expect(cards.map((c) => c.cardId)).toEqual(['k:b', 'k:a']);
  });
});

describe('gradeFromAnswer', () => {
  it('maps answers to grades', () => {
    expect(gradeFromAnswer({ correct: false })).toBe('again');
    expect(gradeFromAnswer({ correct: false, hesitant: true })).toBe('again');
    expect(gradeFromAnswer({ correct: true, hesitant: true })).toBe('hard');
    expect(gradeFromAnswer({ correct: true, hesitant: false })).toBe('good');
    expect(gradeFromAnswer({ correct: true })).toBe('good');
  });
});
