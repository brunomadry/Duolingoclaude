/**
 * Lesson engine for the writing phase (L1 to L16): turns a curriculum lesson plus what the
 * learner already knows into a concrete plan of steps and exercises (kana and words).
 *
 * Pure and deterministic (seeded), so a plan can be rebuilt and tested. Grammar and chat
 * steps plug into the same Step union in later phases.
 */
import type { Lesson } from '../shared/content-schema.ts';
import type { Grade } from '../srs/types.ts';
import { createRng, sample, shuffle, type Rng } from './rng.ts';
import type { SentenceItem } from './sentences.ts';
import { foldPolish, vocabCardId, type WordItem } from './vocab.ts';

export interface KanaItem {
  char: string;
  romaji: string;
  alt?: readonly string[];
  script: 'hiragana' | 'katakana';
}

export type KanaExerciseKind =
  'kana-to-romaji' | 'romaji-to-kana' | 'audio-to-kana' | 'type-romaji';
/**
 * word-to-meaning: the word, pick its Polish meaning; meaning-to-word: the meaning, pick the
 * word; audio-to-word: listen, pick the word; type-word: the meaning, type the word in romaji.
 */
export type WordExerciseKind =
  'word-to-meaning' | 'meaning-to-word' | 'audio-to-word' | 'type-word';
/**
 * sentence-tiles: the Polish sentence, arrange kana tiles; sentence-gap: pick the missing
 * particle; sentence-meaning: read, pick the Polish meaning; sentence-audio: listen, pick it.
 */
export type SentenceExerciseKind =
  'sentence-tiles' | 'sentence-gap' | 'sentence-meaning' | 'sentence-audio';
export type ExerciseKind = KanaExerciseKind | WordExerciseKind | SentenceExerciseKind;

interface ExerciseBase {
  /** Unique within a plan. */
  id: string;
  /** SRS card trained by this exercise. */
  cardId: string;
  /** Answer choices. Empty for typing. */
  options: string[];
  /** The correct choice, in the same form as `options`. */
  answer: string;
}

export interface KanaExercise extends ExerciseBase {
  kind: KanaExerciseKind;
  item: KanaItem;
}

export interface WordExercise extends ExerciseBase {
  kind: WordExerciseKind;
  word: WordItem;
}

export interface SentenceExercise extends ExerciseBase {
  kind: SentenceExerciseKind;
  sentence: SentenceItem;
  /** sentence-tiles: the tiles to arrange (the sentence's own plus distractors), shuffled. */
  tiles?: string[];
  /** sentence-gap: index of the hidden tile. */
  gap?: number;
}

export type Exercise = KanaExercise | WordExercise | SentenceExercise;

export function isKanaExercise(e: Exercise): e is KanaExercise {
  return 'item' in e;
}

export function isWordExercise(e: Exercise): e is WordExercise {
  return 'word' in e;
}

export function isSentenceExercise(e: Exercise): e is SentenceExercise {
  return 'sentence' in e;
}

export type Step =
  | { kind: 'review'; exercises: Exercise[]; dueTotal: number }
  | { kind: 'new'; items: KanaItem[]; groupIds: string[] }
  | { kind: 'words'; words: WordItem[] }
  | { kind: 'practice'; exercises: Exercise[]; mode: 'practice' | 'test' }
  | { kind: 'summary'; quiz: Exercise[] };

export type StepKind = Step['kind'];

export interface LessonPlan {
  n: number;
  title: string;
  steps: Step[];
}

export interface PlanInput {
  lesson: Pick<Lesson, 'n' | 'kind' | 'title' | 'newItem'>;
  /** Kana introduced by this lesson (empty for tests and review lessons). */
  lessonItems: readonly KanaItem[];
  /** For tests and review lessons: everything they cover. */
  coveredItems: readonly KanaItem[];
  /** Everything learned before this lesson (distractor pool). */
  knownItems: readonly KanaItem[];
  /** Due reviews, already capped by the SRS queue. */
  dueReviews: readonly KanaItem[];
  dueTotal: number;
  /** A Japanese voice exists and sound is on (enables listening exercises). */
  speech: boolean;
  seed: number;
  /** Words introduced by this lesson. */
  lessonWords?: readonly WordItem[];
  /** For tests, review lessons and extra practice: the words they cover. */
  coveredWords?: readonly WordItem[];
  /** Words taught before this lesson (distractor pool). */
  knownWords?: readonly WordItem[];
  /** Due word reviews, already capped by the SRS queue. */
  dueWords?: readonly WordItem[];
  /** Extra distractors when few words are known (readable with the kana known so far). */
  spareWords?: readonly WordItem[];
}

export const PRACTICE_CAP = 18;
export const WORD_PRACTICE_CAP = 12;
export const TEST_LENGTH = 20;
export const REVIEW_LESSON_LENGTH = 16;
export const QUIZ_LENGTH = 4;
/** Share of words in mixed kana and word sessions (tests, review lessons, extra practice). */
const WORD_SHARE = 0.35;

export function kanaCardId(char: string): string {
  return `kana:${char}`;
}

export function charFromCardId(cardId: string): string | null {
  return cardId.startsWith('kana:') ? cardId.slice(5) : null;
}

function uniqueByChar(items: readonly KanaItem[]): KanaItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.char) ? false : (seen.add(i.char), true)));
}

/**
 * Builds up to 4 options. Distractors never share the answer's romaji (ぢ and じ are
 * both "ji"), prefer the same script and are unique.
 */
function buildOptions(
  item: KanaItem,
  pool: readonly KanaItem[],
  field: 'romaji' | 'char',
  rng: Rng,
): string[] {
  const answer = field === 'romaji' ? item.romaji : item.char;
  // A distractor must not also be a correct reading: ヲ (o, also "wo") next to ウォ (wo).
  const candidates = pool.filter(
    (p) =>
      p.char !== item.char &&
      p.romaji !== item.romaji &&
      !(p.alt ?? []).includes(item.romaji) &&
      !(item.alt ?? []).includes(p.romaji),
  );
  const sameScript = candidates.filter((p) => p.script === item.script);
  const ordered = [
    ...shuffle(sameScript, rng),
    ...shuffle(
      candidates.filter((p) => p.script !== item.script),
      rng,
    ),
  ];
  const values: string[] = [];
  for (const c of ordered) {
    const v = field === 'romaji' ? c.romaji : c.char;
    if (v !== answer && !values.includes(v)) values.push(v);
    if (values.length === 3) break;
  }
  return shuffle([answer, ...values], rng);
}

function makeExercise(
  kind: KanaExerciseKind,
  item: KanaItem,
  pool: readonly KanaItem[],
  rng: Rng,
  id: string,
): KanaExercise {
  const base = { id, kind, cardId: kanaCardId(item.char), item };
  const typed: KanaExercise = { ...base, kind: 'type-romaji', options: [], answer: item.romaji };
  if (kind === 'type-romaji') return typed;
  const options = buildOptions(item, pool, kind === 'kana-to-romaji' ? 'romaji' : 'char', rng);
  // A choice with only the right answer is no question: fall back to typing.
  if (options.length < 2) return typed;
  return { ...base, options, answer: kind === 'kana-to-romaji' ? item.romaji : item.char };
}

function uniqueById(words: readonly WordItem[]): WordItem[] {
  const seen = new Set<string>();
  return words.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
}

/** True when either word could be a correct answer for the other (same kana or a shared sense). */
function confusable(a: WordItem, b: WordItem): boolean {
  if (a.id === b.id || a.kana === b.kana) return true;
  const senses = new Set(a.pl.map(foldPolish));
  return b.pl.some((s) => senses.has(foldPolish(s)));
}

/**
 * Up to 4 options: the answer plus distractors that are never also correct, taken from
 * the main pool first and the spare pool only when the main pool runs short.
 */
function buildWordOptions(
  word: WordItem,
  pool: readonly WordItem[],
  spare: readonly WordItem[],
  field: 'meaning' | 'kana',
  rng: Rng,
): string[] {
  const value = (w: WordItem) => (field === 'meaning' ? (w.pl[0] ?? w.romaji) : w.kana);
  const answer = value(word);
  const values: string[] = [];
  for (const group of [pool, spare]) {
    for (const c of shuffle(
      group.filter((w) => !confusable(word, w)),
      rng,
    )) {
      if (values.length === 3) break;
      const v = value(c);
      if (v !== answer && !values.includes(v)) values.push(v);
    }
  }
  return shuffle([answer, ...values], rng);
}

function makeWordExercise(
  kind: WordExerciseKind,
  word: WordItem,
  pool: readonly WordItem[],
  spare: readonly WordItem[],
  rng: Rng,
  id: string,
): WordExercise {
  const base = { id, kind, cardId: vocabCardId(word.id), word };
  const typed: WordExercise = { ...base, kind: 'type-word', options: [], answer: word.kana };
  if (kind === 'type-word') return typed;
  const field = kind === 'word-to-meaning' ? 'meaning' : 'kana';
  const options = buildWordOptions(word, pool, spare, field, rng);
  if (options.length < 2) return typed;
  return { ...base, options, answer: field === 'meaning' ? (word.pl[0] ?? '') : word.kana };
}

/** What an exercise is about, so the same thing never comes twice in a row. */
function subjectOf(e: Exercise): string {
  if (isKanaExercise(e)) return `k:${e.item.char}`;
  return isWordExercise(e) ? `w:${e.word.id}` : `s:${e.sentence.id}`;
}

/** Reorders so the same character or word never appears twice in a row when avoidable. */
function spreadOut<T extends Exercise>(exercises: T[]): T[] {
  const out: T[] = [];
  const rest = [...exercises];
  while (rest.length) {
    const prev = out[out.length - 1];
    const idx = rest.findIndex((e) => !prev || subjectOf(e) !== subjectOf(prev));
    out.push(...rest.splice(idx === -1 ? 0 : idx, 1));
  }
  return out;
}

function mixedExercises(
  items: readonly KanaItem[],
  count: number,
  pool: readonly KanaItem[],
  speech: boolean,
  rng: Rng,
  prefix: string,
): KanaExercise[] {
  const kinds: KanaExerciseKind[] = [
    'kana-to-romaji',
    'type-romaji',
    speech ? 'audio-to-kana' : 'romaji-to-kana',
    'romaji-to-kana',
  ];
  const picked: KanaItem[] = [];
  // Cover every item once before repeating any.
  while (picked.length < count && items.length) {
    picked.push(...shuffle(items, rng).slice(0, count - picked.length));
  }
  return spreadOut(
    picked.map((item, i) =>
      makeExercise(kinds[i % kinds.length] as KanaExerciseKind, item, pool, rng, `${prefix}${i}`),
    ),
  );
}

function mixedWordExercises(
  words: readonly WordItem[],
  count: number,
  pool: readonly WordItem[],
  spare: readonly WordItem[],
  speech: boolean,
  rng: Rng,
  prefix: string,
): WordExercise[] {
  const kinds: WordExerciseKind[] = [
    'word-to-meaning',
    'meaning-to-word',
    speech ? 'audio-to-word' : 'word-to-meaning',
    'type-word',
  ];
  return shuffle(words, rng)
    .slice(0, count)
    .map((w, i) =>
      makeWordExercise(
        kinds[i % kinds.length] as WordExerciseKind,
        w,
        pool,
        spare,
        rng,
        `${prefix}${i}`,
      ),
    );
}

/** Splits a session length between kana and words (words get about a third). */
function splitLength(total: number, kanaCount: number, wordCount: number): [number, number] {
  if (!wordCount) return [total, 0];
  if (!kanaCount) return [0, Math.min(total, wordCount)];
  const words = Math.min(wordCount, Math.max(2, Math.round(total * WORD_SHARE)));
  return [total - words, words];
}

function practiceForNewItems(
  items: readonly KanaItem[],
  pool: readonly KanaItem[],
  speech: boolean,
  rng: Rng,
): KanaExercise[] {
  // Round 1: recognise each new character in the order it was introduced (gentle start).
  const round1 = items.map((item, i) => makeExercise('kana-to-romaji', item, pool, rng, `p1-${i}`));
  // Round 2: the other direction (listening when a voice exists).
  const round2 = shuffle(items, rng).map((item, i) =>
    makeExercise(
      speech && i % 2 === 0 ? 'audio-to-kana' : 'romaji-to-kana',
      item,
      pool,
      rng,
      `p2-${i}`,
    ),
  );
  // Round 3: production for every other character.
  const round3 = shuffle(items, rng)
    .filter((_, i) => i % 2 === 0)
    .map((item, i) => makeExercise('type-romaji', item, pool, rng, `p3-${i}`));

  let all = [...round1, ...spreadOut([...round2, ...round3])];
  if (all.length > PRACTICE_CAP) {
    // Large groups (yoon): keep one recognition per item first, then fill.
    const keep = new Set<string>();
    const capped: KanaExercise[] = [];
    for (const e of all) {
      if (!keep.has(e.item.char) && capped.length < PRACTICE_CAP) {
        keep.add(e.item.char);
        capped.push(e);
      }
    }
    for (const e of all) {
      if (capped.length >= PRACTICE_CAP) break;
      if (!capped.includes(e)) capped.push(e);
    }
    all = capped;
  }
  return all;
}

function practiceForNewWords(
  words: readonly WordItem[],
  pool: readonly WordItem[],
  spare: readonly WordItem[],
  speech: boolean,
  rng: Rng,
): WordExercise[] {
  // Round 1: recognise each new word (meaning), in the order it was introduced.
  const round1 = words.map((w, i) =>
    makeWordExercise('word-to-meaning', w, pool, spare, rng, `pw1-${i}`),
  );
  // Round 2: the other direction, from the meaning or by ear.
  const round2 = shuffle(words, rng).map((w, i) =>
    makeWordExercise(
      speech && i % 2 === 1 ? 'audio-to-word' : 'meaning-to-word',
      w,
      pool,
      spare,
      rng,
      `pw2-${i}`,
    ),
  );
  // Round 3: write every other word.
  const round3 = shuffle(words, rng)
    .filter((_, i) => i % 2 === 0)
    .map((w, i) => makeWordExercise('type-word', w, pool, spare, rng, `pw3-${i}`));
  return [...round1, ...spreadOut([...round2, ...round3])].slice(0, WORD_PRACTICE_CAP);
}

/** Up to QUIZ_LENGTH quick checks, half on words when the lesson has any. */
function quiz(
  kana: readonly KanaItem[],
  kanaPool: readonly KanaItem[],
  words: readonly WordItem[],
  wordPool: readonly WordItem[],
  spare: readonly WordItem[],
  rng: Rng,
): Exercise[] {
  const wordCount = Math.min(words.length, kana.length ? QUIZ_LENGTH / 2 : QUIZ_LENGTH);
  return [
    ...sample(kana, QUIZ_LENGTH - wordCount, rng).map((item, i) =>
      makeExercise('kana-to-romaji', item, kanaPool, rng, `q${i}`),
    ),
    ...sample(words, wordCount, rng).map((w, i) =>
      makeWordExercise('word-to-meaning', w, wordPool, spare, rng, `qw${i}`),
    ),
  ];
}

export function buildLessonPlan(input: PlanInput): LessonPlan {
  const rng = createRng(input.seed);
  const { lesson } = input;
  const lessonItems = uniqueByChar(input.lessonItems);
  const covered = uniqueByChar(input.coveredItems);
  const pool = uniqueByChar([...lessonItems, ...covered, ...input.knownItems, ...input.dueReviews]);
  const lessonWords = uniqueById(input.lessonWords ?? []);
  const coveredWords = uniqueById(input.coveredWords ?? []);
  const dueWords = uniqueById(input.dueWords ?? []);
  const wordPool = uniqueById([
    ...lessonWords,
    ...coveredWords,
    ...(input.knownWords ?? []),
    ...dueWords,
  ]);
  const spare = input.spareWords ?? [];
  const steps: Step[] = [];

  if (input.dueReviews.length || dueWords.length) {
    const reviewItems = uniqueByChar(input.dueReviews);
    steps.push({
      kind: 'review',
      dueTotal: input.dueTotal,
      exercises: spreadOut([
        ...reviewItems.map((item, i) =>
          makeExercise(i % 2 === 0 ? 'kana-to-romaji' : 'type-romaji', item, pool, rng, `r${i}`),
        ),
        ...dueWords.map((w, i) =>
          makeWordExercise(
            (['word-to-meaning', 'meaning-to-word', 'type-word'] as const)[i % 3] ??
              'word-to-meaning',
            w,
            wordPool,
            spare,
            rng,
            `rw${i}`,
          ),
        ),
      ]),
    });
  }

  if (lesson.kind === 'test') {
    const length = Math.min(TEST_LENGTH, Math.max(covered.length + coveredWords.length, 8));
    const [kanaLength, wordLength] = splitLength(length, covered.length, coveredWords.length);
    steps.push({
      kind: 'practice',
      mode: 'test',
      exercises: [
        ...mixedExercises(covered, kanaLength, pool, input.speech, rng, 't'),
        ...mixedWordExercises(coveredWords, wordLength, wordPool, spare, input.speech, rng, 'tw'),
      ],
    });
    // A test is its own summary: no empty quiz step after it.
    return { n: lesson.n, title: lesson.title, steps };
  }

  if (lessonItems.length) {
    steps.push({
      kind: 'new',
      items: lessonItems,
      groupIds: lesson.newItem.type === 'kana' ? lesson.newItem.groups : [],
    });
  }
  if (lessonWords.length) steps.push({ kind: 'words', words: lessonWords });

  // Review lessons (e.g. L16, both alphabets mixed) and extra practice go over what they cover.
  const reviewLength = Math.min(
    REVIEW_LESSON_LENGTH,
    Math.max(covered.length + coveredWords.length, 4),
  );
  const [kanaLength, wordLength] = lessonItems.length
    ? [0, 0]
    : splitLength(reviewLength, covered.length, coveredWords.length);
  steps.push({
    kind: 'practice',
    mode: 'practice',
    exercises: [
      ...practiceForNewItems(lessonItems, pool, input.speech, rng),
      ...practiceForNewWords(lessonWords, wordPool, spare, input.speech, rng),
      ...spreadOut([
        ...mixedExercises(covered, kanaLength, pool, input.speech, rng, 'm'),
        ...mixedWordExercises(coveredWords, wordLength, wordPool, spare, input.speech, rng, 'mw'),
      ]),
    ],
  });
  const fresh = lessonItems.length || lessonWords.length;
  steps.push({
    kind: 'summary',
    quiz: fresh
      ? quiz(lessonItems, pool, lessonWords, wordPool, spare, rng)
      : quiz(covered, pool, coveredWords, wordPool, spare, rng),
  });
  return { n: lesson.n, title: lesson.title, steps };
}

export interface AnswerResult {
  cardId: string;
  correct: boolean;
}

/** One SRS grade per card per session: any miss means "again", otherwise "good". */
export function gradesFromResults(results: readonly AnswerResult[]): Map<string, Grade> {
  const grades = new Map<string, Grade>();
  for (const r of results) {
    if (!r.correct) grades.set(r.cardId, 'again');
    else if (!grades.has(r.cardId)) grades.set(r.cardId, 'good');
  }
  return grades;
}

export function scoreOf(results: readonly AnswerResult[]): number {
  if (!results.length) return 1;
  return results.filter((r) => r.correct).length / results.length;
}
