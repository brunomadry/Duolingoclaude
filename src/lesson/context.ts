/**
 * Glue between content (curriculum, kana, vocabulary, grammar), the learner's progress and
 * the pure lesson engine: works out what is known, what is due and builds the plan.
 */
import curriculumData from '../../content/curriculum.json';
import type { Curriculum, Lesson } from '../shared/content-schema.ts';
import type { CardRecord, LessonProgressRecord } from '../shared/api.ts';
import { GRAMMAR_KEY_GATES, createGates } from '../shared/grammar-gates.ts';
import type { SrsState } from '../srs/types.ts';
import { buildReviewQueue } from '../srs/queue.ts';
import { buildLessonPlan, charFromCardId, type KanaItem, type LessonPlan } from './engine.ts';
import { sentencesFor, sentencesUpTo, type GrammarIndex } from './grammar.ts';
import { groupById } from './kana.ts';
import { createRng, seedFrom, shuffle } from './rng.ts';
import { grammarCardId, grammarIdFromCardId } from './sentence-exercises.ts';
import { GAP_PARTICLES, type SentenceItem } from './sentences.ts';
import { wordIdFromCardId, wordsUpTo, type VocabIndex, type WordItem } from './vocab.ts';
import { CHAT_FROM_LESSON, KANA_PHASE_END } from '../shared/constants.ts';

export const curriculum = curriculumData as Curriculum;
export const gates = createGates(curriculum);

/** Grammar notes ship as optional content; grammar lessons open once they exist. */
export const GRAMMAR_AVAILABLE =
  Object.keys(import.meta.glob('../../content/grammar.json')).length > 0;

export function lessonByN(n: number): Lesson | undefined {
  return curriculum.lessons[n - 1];
}

/**
 * Lessons the engine can teach today. Later phases extend this as content arrives (kanji
 * lessons and the final reviews come with Phase 6); until then those lessons stay closed
 * instead of being completable as empty shells (their completion would be permanent).
 */
export function lessonSupported(lesson: Pick<Lesson, 'n' | 'kind'>): boolean {
  if (lesson.n <= KANA_PHASE_END) return true;
  return (
    GRAMMAR_AVAILABLE &&
    (lesson.kind === 'grammar' || lesson.kind === 'practice' || lesson.kind === 'test')
  );
}

/** The grammar point a lesson works on: its own, or the latest one before it. */
export function focusGrammarOf(n: number): { id: string; lesson: number } | null {
  for (let m = n; m >= 1; m--) {
    const l = curriculum.lessons[m - 1];
    if (l?.newItem.type === 'grammar') return { id: l.newItem.grammarId, lesson: m };
  }
  return null;
}

/** Words taught with a grammar point (its lesson and the practice lesson after it). */
export function wordsOfGrammar(id: string): Set<string> {
  const n = gates.lessonOfGrammar(id);
  if (n === null) return new Set();
  return new Set(
    curriculum.lessons.filter((l) => l.n === n || l.n === n + 1).flatMap((l) => l.words),
  );
}

/** Gap-fill particles taught by the end of lesson n. */
export function particlesUpTo(n: number): string[] {
  return Object.keys(GAP_PARTICLES).filter((k) => {
    const at = gates.keyLesson(k);
    return at !== null && at <= n;
  });
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
  /** Due grammar ids (reviewed with a sentence). */
  grammarIds: string[];
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
          (filter !== 'words' && charFromCardId(c.cardId)) ||
          (filter === 'all' && grammarIdFromCardId(c.cardId))),
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
  const grammarIds = queue
    .map((q) => grammarIdFromCardId(q.cardId))
    .filter((id): id is string => id !== null);
  return { items, wordIds, grammarIds, dueTotal };
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

export const SENTENCES_IN_GRAMMAR_LESSON = 8;
export const SENTENCES_IN_PRACTICE_LESSON = 12;

const lessonOfGrammar = (id: string) => gates.lessonOfGrammar(id) ?? 0;

/** The grammar card a sentence trains: the lesson's focus when it practises it, else its newest point. */
function cardFor(s: SentenceItem, focus: string | null, focusWords: ReadonlySet<string>): string {
  if (focus && (s.grammar.includes(focus) || s.words.some((w) => focusWords.has(w))))
    return grammarCardId(focus);
  const newest = [...s.grammar].sort((a, b) => lessonOfGrammar(b) - lessonOfGrammar(a))[0];
  return grammarCardId(newest ?? focus ?? 'wa-desu');
}

/** One sentence per due grammar card, chosen among those the learner can read. */
export function dueSentenceReviews(
  grammarIds: readonly string[],
  grammar: GrammarIndex | undefined,
  upTo: number,
  seed: string,
): { cardId: string; sentence: SentenceItem }[] {
  if (!grammar) return [];
  const pool = sentencesUpTo(grammar, upTo);
  const rng = createRng(seedFrom(seed));
  return grammarIds.flatMap((id) => {
    const pick = shuffle(sentencesFor(pool, id, wordsOfGrammar(id)).slice(0, 10), rng)[0];
    return pick ? [{ cardId: grammarCardId(id), sentence: pick }] : [];
  });
}

export function planLesson(
  lesson: Lesson,
  ctx: PlanContext,
  vocab: VocabIndex,
  grammar?: GrammarIndex,
): LessonPlan {
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

  // Sentences: grammar and practice lessons work on their grammar point, tests on what they cover.
  const seed = `${lesson.n}:${ctx.attempt ?? 0}`;
  const pool = grammar && lesson.n > KANA_PHASE_END ? sentencesUpTo(grammar, lesson.n) : [];
  const focus = lesson.n > KANA_PHASE_END ? focusGrammarOf(lesson.n) : null;
  const focusWords = focus ? wordsOfGrammar(focus.id) : new Set<string>();
  let sentences: SentenceItem[] = [];
  let sentenceCount = 0;
  let sentenceCard = (s: SentenceItem) => cardFor(s, focus?.id ?? null, focusWords);
  if (covers) {
    const coveredGrammar = coveredLessons.flatMap((l) =>
      l.newItem.type === 'grammar' ? [l.newItem.grammarId] : [],
    );
    const coveredIds = new Set(coveredLessons.flatMap((l) => l.words));
    sentences = pool.filter(
      (s) =>
        s.grammar.some((g) => coveredGrammar.includes(g)) || s.words.some((w) => coveredIds.has(w)),
    );
    sentenceCard = (s) => {
      const own = coveredGrammar.filter((g) => s.grammar.includes(g));
      return grammarCardId(own.at(-1) ?? coveredGrammar.at(-1) ?? 'wa-desu');
    };
  } else if (focus && (lesson.kind === 'grammar' || lesson.kind === 'practice')) {
    const relevant = sentencesFor(pool, focus.id, focusWords);
    const rest = pool.filter((s) => !relevant.includes(s)).reverse();
    sentences = [...relevant, ...rest];
    sentenceCount =
      lesson.kind === 'grammar' ? SENTENCES_IN_GRAMMAR_LESSON : SENTENCES_IN_PRACTICE_LESSON;
  }

  return buildLessonPlan({
    lesson,
    lessonItems: lessonKana(lesson),
    coveredItems: covered,
    knownItems: kanaUpTo(lesson.n - 1),
    dueReviews: due.items,
    dueTotal: due.dueTotal,
    speech: ctx.speech,
    seed: seedFrom(seed),
    lessonWords: vocab.byLesson.get(lesson.n) ?? [],
    coveredWords,
    knownWords: wordsUpTo(vocab, lesson.n - 1),
    dueWords: wordsOf(vocab, due.wordIds),
    spareWords: readableWords(vocab, lesson.n),
    ...(lesson.kind === 'grammar' && lesson.newItem.type === 'grammar' && grammar
      ? { grammarNote: grammar.notes.get(lesson.newItem.grammarId) }
      : {}),
    sentences,
    sentencePool: pool,
    sentenceCount,
    particles: particlesUpTo(lesson.n),
    focusKeys: Object.keys(GRAMMAR_KEY_GATES).filter((k) => GRAMMAR_KEY_GATES[k] === focus?.id),
    sentenceCard,
    dueSentences: dueSentenceReviews(due.grammarIds, grammar, lesson.n - 1, `due:${seed}`),
    chat: lesson.n >= CHAT_FROM_LESSON && (lesson.kind === 'grammar' || lesson.kind === 'practice'),
  });
}
