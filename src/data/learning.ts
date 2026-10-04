/**
 * Learning data on top of the repository: SRS card states and lesson completions.
 * All writes go through repo.ts so they are queued for sync.
 */
import type { CardRecord, LessonProgressRecord } from '../shared/api.ts';
import type { Grade, SrsState } from '../srs/types.ts';
import { reviewCard } from '../srs/index.ts';
import type { Database } from './db.ts';
import { getCards, getLessons, putCards, putLesson } from './repo.ts';

export interface LearningSnapshot {
  cards: Map<string, CardRecord>;
  lessons: LessonProgressRecord[];
}

export async function loadLearning(db: Database, profileId: string): Promise<LearningSnapshot> {
  const [cards, lessons] = await Promise.all([getCards(db, profileId), getLessons(db, profileId)]);
  return {
    cards: new Map(cards.filter((c) => !c.deleted).map((c) => [c.cardId, c])),
    lessons: lessons.sort((a, b) => a.n - b.n),
  };
}

export function cardState(card: CardRecord | undefined): SrsState | undefined {
  return card ? (card.data as SrsState) : undefined;
}

/** Applies one grade per card (from a finished step) and queues the new states. */
export async function applyGrades(
  db: Database,
  profileId: string,
  grades: ReadonlyMap<string, Grade>,
  now: number,
): Promise<void> {
  if (!grades.size) return;
  const existing = new Map((await getCards(db, profileId)).map((c) => [c.cardId, c]));
  const updates: CardRecord[] = [];
  for (const [cardId, grade] of grades) {
    const state = reviewCard(cardState(existing.get(cardId)), grade, now);
    updates.push({ profileId, cardId, data: { ...state }, updatedAt: now, deleted: false });
  }
  await putCards(db, updates);
}

/**
 * Records a finished lesson. The first completion time is kept forever (it drives
 * unlocking), so replaying a lesson never pushes the next unlock further away.
 * Only a better score is written back.
 */
export async function recordCompletion(
  db: Database,
  profileId: string,
  n: number,
  score: number,
  now: number,
): Promise<'new' | 'improved' | 'unchanged'> {
  const lessons = await getLessons(db, profileId);
  const current = lessons.find((l) => l.n === n);
  const rounded = Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
  if (!current) {
    await putLesson(db, { profileId, n, completedAt: now, score: rounded });
    return 'new';
  }
  if ((current.score ?? 0) < rounded) {
    await putLesson(db, { profileId, n, completedAt: current.completedAt, score: rounded });
    return 'improved';
  }
  return 'unchanged';
}
