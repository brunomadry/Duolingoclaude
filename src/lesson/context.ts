/**
 * Glue between content (curriculum + kana), the learner's progress and the pure
 * lesson engine: works out what is known, what is due and builds the plan.
 */
import curriculumData from '../../content/curriculum.json';
import type { Curriculum, Lesson } from '../shared/content-schema.ts';
import type { CardRecord, LessonProgressRecord } from '../shared/api.ts';
import type { SrsState } from '../srs/types.ts';
import { buildReviewQueue } from '../srs/queue.ts';
import { buildLessonPlan, charFromCardId, type KanaItem, type LessonPlan } from './engine.ts';
import { groupById } from './kana.ts';
import { seedFrom } from './rng.ts';

export const curriculum = curriculumData as Curriculum;

export function lessonByN(n: number): Lesson | undefined {
  return curriculum.lessons[n - 1];
}

export function itemsOfGroups(groupIds: readonly string[]): KanaItem[] {
  const out: KanaItem[] = [];
  for (const id of groupIds) {
    const group = groupById(id);
    if (!group) continue;
    for (const c of group.chars) {
      out.push({ char: c.char, romaji: c.romaji, alt: c.alt, script: group.script });
    }
  }
  return out;
}

/** Kana introduced by lessons 1..upTo (inclusive). */
export function kanaUpTo(upTo: number): KanaItem[] {
  const groups = curriculum.lessons
    .filter((l) => l.n <= upTo && l.newItem.type === 'kana')
    .flatMap((l) => (l.newItem.type === 'kana' ? l.newItem.groups : []));
  return itemsOfGroups(groups);
}

export function lessonKana(lesson: Lesson): KanaItem[] {
  return lesson.newItem.type === 'kana' ? itemsOfGroups(lesson.newItem.groups) : [];
}

/** Number of the highest lesson such that 1..n are all completed. */
export function completedPrefix(lessons: readonly LessonProgressRecord[]): number {
  const done = new Set(lessons.map((l) => l.n));
  let n = 0;
  while (done.has(n + 1)) n++;
  return n;
}

export interface DueInfo {
  items: KanaItem[];
  dueTotal: number;
}

/** Due kana reviews, capped by the SRS queue so the review step never snowballs. */
export function dueKana(cards: ReadonlyMap<string, CardRecord>, now: number, max?: number): DueInfo {
  const all = [...cards.values()]
    .filter((c) => !c.deleted && charFromCardId(c.cardId))
    .map((c) => ({ cardId: c.cardId, state: c.data as SrsState }));
  const { queue, dueTotal } = buildReviewQueue(all, now, max === undefined ? undefined : { max });
  const known = new Map(kanaUpTo(100).map((i) => [i.char, i]));
  const items = queue
    .map((q) => known.get(charFromCardId(q.cardId) ?? ''))
    .filter((i): i is KanaItem => i !== undefined);
  return { items, dueTotal };
}

export interface PlanContext {
  lessons: readonly LessonProgressRecord[];
  cards: ReadonlyMap<string, CardRecord>;
  now: number;
  speech: boolean;
  /** Makes replays differ from the first attempt. */
  attempt?: number;
}

export function planLesson(lesson: Lesson, ctx: PlanContext): LessonPlan {
  const due = dueKana(ctx.cards, ctx.now);
  const covers = lesson.kind === 'test' ? lesson.covers : undefined;
  const covered = covers
    ? itemsOfGroups(
        curriculum.lessons
          .filter((l) => l.n >= covers[0] && l.n <= covers[1])
          .flatMap((l) => (l.newItem.type === 'kana' ? l.newItem.groups : [])),
      )
    : lesson.kind === 'review'
      ? kanaUpTo(lesson.n)
      : [];
  return buildLessonPlan({
    lesson,
    lessonItems: lessonKana(lesson),
    coveredItems: covered,
    knownItems: kanaUpTo(lesson.n - 1),
    dueReviews: due.items,
    dueTotal: due.dueTotal,
    speech: ctx.speech,
    seed: seedFrom(`${lesson.n}:${ctx.attempt ?? 0}`),
  });
}
