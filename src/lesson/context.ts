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
import {
  kanjiFromCardId,
  kanjiKnown,
  kanjiUpTo,
  lessonKanji,
  type KanjiIndex,
  type KanjiItem,
} from './kanji.ts';
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
  return lesson.n <= KANA_PHASE_END || GRAMMAR_AVAILABLE;
}

/** The last lesson is the final N5 check: a test over the whole course. */
export const FINAL_LESSON = 100;

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
  /** Due kanji (map them with the kanji index). */
  kanjiChars: string[];
  dueTotal: number;
}

/**
 * Due kana and word reviews, capped by the SRS queue so the review step never snowballs.
 * With `reviewable`, cards no exercise can be built for (see reviewableCard) are left out
 * before the cap, so they can never hold places in the queue.
 */
export function dueReviews(
  cards: ReadonlyMap<string, CardRecord>,
  now: number,
  opts: { max?: number; filter?: ReviewFilter; reviewable?: (cardId: string) => boolean } = {},
): DueInfo {
  const filter = opts.filter ?? 'all';
  const all = [...cards.values()]
    .filter(
      (c) =>
        !c.deleted &&
        ((filter !== 'kana' && wordIdFromCardId(c.cardId)) ||
          (filter !== 'words' && (charFromCardId(c.cardId) || kanjiFromCardId(c.cardId))) ||
          (filter === 'all' && grammarIdFromCardId(c.cardId))) &&
        (opts.reviewable?.(c.cardId) ?? true),
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
  const kanjiChars = queue
    .map((q) => kanjiFromCardId(q.cardId))
    .filter((ch): ch is string => ch !== null);
  return { items, wordIds, grammarIds, kanjiChars, dueTotal };
}

/**
 * The same question judged from the curriculum alone, for due counts on screens that do
 * not load the course content: the card's word or kanji is taught by some lesson and its
 * grammar point by a completed one.
 */
export function reviewableByCurriculum(done: number): (cardId: string) => boolean {
  const kana = new Set(kanaUpTo(100).map((i) => i.char));
  const words = new Set(curriculum.lessons.flatMap((l) => l.words));
  const kanji = new Set(curriculum.lessons.flatMap((l) => lessonKanji(l)));
  return (cardId) => {
    const char = charFromCardId(cardId);
    if (char !== null) return kana.has(char);
    const word = wordIdFromCardId(cardId);
    if (word !== null) return words.has(word);
    const kanjiChar = kanjiFromCardId(cardId);
    if (kanjiChar !== null) return kanji.has(kanjiChar);
    const id = grammarIdFromCardId(cardId);
    const at = id === null ? null : gates.lessonOfGrammar(id);
    return at !== null && at <= done;
  };
}

/**
 * Can the review step build an exercise for a card, with sentences up to lesson `upTo`? A
 * grammar card needs a sentence the learner can read; a word or kanji card needs its entry
 * (content may change, and the kanji data may fail to load).
 */
export function reviewableCard(
  vocab: VocabIndex,
  grammar: GrammarIndex | undefined,
  kanji: KanjiIndex | undefined,
  upTo: number,
): (cardId: string) => boolean {
  const kana = new Set(kanaUpTo(100).map((i) => i.char));
  const pool = grammar ? sentencesUpTo(grammar, upTo) : [];
  const grammarOk = new Map<string, boolean>();
  return (cardId) => {
    const char = charFromCardId(cardId);
    if (char !== null) return kana.has(char);
    const word = wordIdFromCardId(cardId);
    if (word !== null) return vocab.byId.has(word);
    const kanjiChar = kanjiFromCardId(cardId);
    if (kanjiChar !== null) return kanji?.byChar.has(kanjiChar) ?? false;
    const id = grammarIdFromCardId(cardId);
    if (id === null) return false;
    let ok = grammarOk.get(id);
    if (ok === undefined) {
      ok = sentencesFor(pool, id, wordsOfGrammar(id)).length > 0;
      grammarOk.set(id, ok);
    }
    return ok;
  };
}

export function kanjiOf(kanji: KanjiIndex | undefined, chars: readonly string[]): KanjiItem[] {
  return chars.map((ch) => kanji?.byChar.get(ch)).filter((k): k is KanjiItem => k !== undefined);
}

/**
 * Words taught by lesson n written with each kanji, newest first. With `known`, only words
 * whose kanji are all known (a reading exercise must not show an untaught kanji).
 */
export function kanjiWordsUpTo(
  vocab: VocabIndex,
  n: number,
  known?: ReadonlySet<string>,
): Map<string, WordItem[]> {
  const map = new Map<string, WordItem[]>();
  for (const w of [...wordsUpTo(vocab, n)].reverse()) {
    if (known && w.kanji && !kanjiKnown(w.kanji, known)) continue;
    for (const ch of new Set(w.kanji ?? '')) {
      if (/[\u3400-\u9fff]/.test(ch)) map.set(ch, [...(map.get(ch) ?? []), w]);
    }
  }
  return map;
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
/** Words revisited by the final review lesson (the rest are sentences and kanji). */
const LATE_REVIEW_WORDS = 8;

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
  kanji?: KanjiIndex,
): LessonPlan {
  const due = dueReviews(ctx.cards, ctx.now, {
    reviewable: reviewableCard(vocab, grammar, kanji, lesson.n - 1),
  });
  const covers = lesson.kind === 'test' ? lesson.covers : undefined;
  const coveredLessons = covers
    ? curriculum.lessons.filter((l) => l.n >= covers[0] && l.n <= covers[1])
    : [];
  // Review lessons after the writing phase (L99, L100) cover the course, without kana drills.
  const lateReview = lesson.kind === 'review' && lesson.n > KANA_PHASE_END;
  const covered = covers
    ? itemsOfGroups(
        coveredLessons.flatMap((l) => (l.newItem.type === 'kana' ? l.newItem.groups : [])),
      )
    : lesson.kind === 'review' && !lateReview
      ? kanaUpTo(lesson.n)
      : [];
  const coveredKanji = kanji
    ? covers
      ? coveredLessons.flatMap((l) => kanji.byLesson.get(l.n) ?? [])
      : lateReview
        ? kanji.items.filter((k) => k.lesson !== null && k.lesson < lesson.n)
        : []
    : [];
  const coveredWords = covers
    ? coveredLessons.flatMap((l) => vocab.byLesson.get(l.n) ?? [])
    : lateReview
      ? shuffle(
          wordsUpTo(vocab, lesson.n - 1),
          createRng(seedFrom(`w:${lesson.n}:${ctx.attempt ?? 0}`)),
        ).slice(0, LATE_REVIEW_WORDS)
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
  } else if (lateReview) {
    sentences = shuffle(pool, createRng(seedFrom(seed)));
    sentenceCount = SENTENCES_IN_PRACTICE_LESSON;
    sentenceCard = (s) => cardFor(s, null, focusWords);
  } else if (focus && (lesson.kind === 'grammar' || lesson.kind === 'practice')) {
    const relevant = sentencesFor(pool, focus.id, focusWords);
    const rest = pool.filter((s) => !relevant.includes(s)).reverse();
    sentences = [...relevant, ...rest];
    sentenceCount =
      lesson.kind === 'grammar' ? SENTENCES_IN_GRAMMAR_LESSON : SENTENCES_IN_PRACTICE_LESSON;
  }

  const finalTest = lesson.n === FINAL_LESSON;
  return buildLessonPlan({
    // The final lesson is planned like a test over everything taught.
    lesson: finalTest ? { ...lesson, kind: 'test' } : lesson,
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
    // The review step comes before anything new: only what earlier lessons taught.
    reviewParticles: particlesUpTo(lesson.n - 1),
    focusKeys: Object.keys(GRAMMAR_KEY_GATES).filter((k) => GRAMMAR_KEY_GATES[k] === focus?.id),
    sentenceCard,
    dueSentences: dueSentenceReviews(due.grammarIds, grammar, lesson.n - 1, `due:${seed}`),
    chat: lesson.n >= CHAT_FROM_LESSON && (lesson.kind === 'grammar' || lesson.kind === 'practice'),
    lessonKanji: kanji?.byLesson.get(lesson.n) ?? [],
    knownKanji: kanji?.items.filter((k) => k.lesson !== null && k.lesson < lesson.n) ?? [],
    coveredKanji,
    dueKanji: kanjiOf(kanji, due.kanjiChars),
    kanjiWords: kanjiWordsUpTo(vocab, lesson.n, kanji ? kanjiUpTo(kanji, lesson.n) : new Set()),
    reviewKanjiWords: kanjiWordsUpTo(
      vocab,
      lesson.n - 1,
      kanji ? kanjiUpTo(kanji, lesson.n - 1) : new Set(),
    ),
  });
}
