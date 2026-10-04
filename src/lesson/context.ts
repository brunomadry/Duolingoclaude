/**
 * Glue between content (curriculum, kana, vocabulary), the learner's progress and the pure
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
import { wordIdFromCardId, wordsUpTo, type VocabIndex, type WordItem } from './vocab.ts';
import { KANA_PHASE_END } from '../shared/constants.ts';

export const curriculum = curriculumData as Curriculum;

export function lessonByN(n: number): Lesson | undefined {
  return curriculum.lessons[n - 1];
}

/**
 * Lessons the engine can teach today. Later phases extend this as vocabulary, grammar and
 * kanji content arrives; until then those lessons stay closed instead of being completable
 * as empty shells (their completion would be permanent).
 */
export function lessonSupported(lesson: Pick<Lesson, 'n'>): boolean {
  return lesson.n <= KANA_PHASE_END;
}

export const COMING_SOON_TEXT = 'Ta lekcja pojawi się w jednej z kolejnych aktualizacji aplikacji.';

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

export type ReviewFilter = 'all' | 'kana' | 'words';

export interface DueInfo {
  items: KanaItem[];
  /** Due word ids (map them with the vocabulary index). */
  wordIds: string[];
  dueTotal: number;
}

/** Due kana and word reviews, capped by the SRS queue so the review step never snowballs. */
export function dueReviews(
  cards: ReadonlyMap<string, CardRecord>,
  now: number,
  opts: { max?: number; filter?: ReviewFilter } = {},
): DueInfo {
  const filter = opts.filter ?? 'all';
  const all = [...cards.values()]
    .filter(
      (c) =>
        !c.deleted &&
        ((filter !== 'kana' && wordIdFromCardId(c.cardId)) ||
          (filter !== 'words' && charFromCardId(c.cardId))),
    )
    .map((c) => ({ cardId: c.cardId, state: c.data as SrsState }));
  const { queue, dueTotal } = buildReviewQueue(
    all,
    now,
    opts.max === undefined ? undefined : { max: opts.max },
  );
  const known = new Map(kanaUpTo(100).map((i) => [i.char, i]));
  const items = queue
    .map((q) => known.get(charFromCardId(q.cardId) ?? ''))
    .filter((i): i is KanaItem => i !== undefined);
  const wordIds = queue
    .map((q) => wordIdFromCardId(q.cardId))
    .filter((id): id is string => id !== null);
  return { items, wordIds, dueTotal };
}

export function wordsOf(vocab: VocabIndex, ids: readonly string[]): WordItem[] {
  return ids.map((id) => vocab.byId.get(id)).filter((w): w is WordItem => w !== undefined);
}

/** Words written only with kana known by the end of lesson n (all words after the writing phase). */
export function readableWords(vocab: VocabIndex, n: number): WordItem[] {
  if (n > KANA_PHASE_END) return vocab.words;
  const known = new Set(['ー', ...kanaUpTo(n).flatMap((i) => [...i.char])]);
  return vocab.words.filter((w) => [...w.kana].every((ch) => known.has(ch)));
}

export interface PlanContext {
  lessons: readonly LessonProgressRecord[];
  cards: ReadonlyMap<string, CardRecord>;
  now: number;
  speech: boolean;
  /** Makes replays differ from the first attempt. */
  attempt?: number;
}

export function planLesson(lesson: Lesson, ctx: PlanContext, vocab: VocabIndex): LessonPlan {
  const due = dueReviews(ctx.cards, ctx.now);
  const covers = lesson.kind === 'test' ? lesson.covers : undefined;
  const coveredLessons = covers
    ? curriculum.lessons.filter((l) => l.n >= covers[0] && l.n <= covers[1])
    : [];
  const covered = covers
    ? itemsOfGroups(
        coveredLessons.flatMap((l) => (l.newItem.type === 'kana' ? l.newItem.groups : [])),
      )
    : lesson.kind === 'review'
      ? kanaUpTo(lesson.n)
      : [];
  const coveredWords = covers
    ? coveredLessons.flatMap((l) => vocab.byLesson.get(l.n) ?? [])
    : lesson.kind === 'review'
      ? wordsUpTo(vocab, lesson.n - 1)
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
    lessonWords: vocab.byLesson.get(lesson.n) ?? [],
    coveredWords,
    knownWords: wordsUpTo(vocab, lesson.n - 1),
    dueWords: wordsOf(vocab, due.wordIds),
    spareWords: readableWords(vocab, lesson.n),
  });
}
