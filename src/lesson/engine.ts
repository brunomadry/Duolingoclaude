/**
 * Lesson engine for kana lessons (L1 to L16): turns a curriculum lesson plus what the
 * learner already knows into a concrete plan of steps and exercises.
 *
 * Pure and deterministic (seeded), so a plan can be rebuilt and tested. Grammar,
 * vocabulary and chat steps plug into the same Step union in later phases.
 */
import type { Lesson } from '../shared/content-schema.ts';
import type { Grade } from '../srs/types.ts';
import { createRng, sample, shuffle, type Rng } from './rng.ts';

export interface KanaItem {
  char: string;
  romaji: string;
  alt?: readonly string[];
  script: 'hiragana' | 'katakana';
}

export type ExerciseKind = 'kana-to-romaji' | 'romaji-to-kana' | 'audio-to-kana' | 'type-romaji';

export interface Exercise {
  /** Unique within a plan. */
  id: string;
  kind: ExerciseKind;
  /** SRS card trained by this exercise. */
  cardId: string;
  item: KanaItem;
  /** Answer choices (romaji for kana-to-romaji, kana otherwise). Empty for typing. */
  options: string[];
  /** The correct choice, in the same alphabet as `options`. */
  answer: string;
}

export type Step =
  | { kind: 'review'; exercises: Exercise[]; dueTotal: number }
  | { kind: 'new'; items: KanaItem[]; groupIds: string[] }
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
  /** Whether a Japanese voice is available (enables listening exercises). */
  speech: boolean;
  seed: number;
}

export const PRACTICE_CAP = 18;
export const TEST_LENGTH = 20;
export const REVIEW_LESSON_LENGTH = 16;
export const QUIZ_LENGTH = 4;

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
  const candidates = pool.filter((p) => p.char !== item.char && p.romaji !== item.romaji);
  const sameScript = candidates.filter((p) => p.script === item.script);
  const ordered = [...shuffle(sameScript, rng), ...shuffle(candidates.filter((p) => p.script !== item.script), rng)];
  const values: string[] = [];
  for (const c of ordered) {
    const v = field === 'romaji' ? c.romaji : c.char;
    if (v !== answer && !values.includes(v)) values.push(v);
    if (values.length === 3) break;
  }
  return shuffle([answer, ...values], rng);
}

function makeExercise(
  kind: ExerciseKind,
  item: KanaItem,
  pool: readonly KanaItem[],
  rng: Rng,
  id: string,
): Exercise {
  const base = { id, kind, cardId: kanaCardId(item.char), item };
  switch (kind) {
    case 'kana-to-romaji':
      return { ...base, options: buildOptions(item, pool, 'romaji', rng), answer: item.romaji };
    case 'romaji-to-kana':
    case 'audio-to-kana':
      return { ...base, options: buildOptions(item, pool, 'char', rng), answer: item.char };
    case 'type-romaji':
      return { ...base, options: [], answer: item.romaji };
  }
}

/** Reorders so the same character never appears twice in a row when avoidable. */
function spreadOut(exercises: Exercise[]): Exercise[] {
  const out: Exercise[] = [];
  const rest = [...exercises];
  while (rest.length) {
    const prev = out[out.length - 1];
    const idx = rest.findIndex((e) => e.item.char !== prev?.item.char);
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
): Exercise[] {
  const kinds: ExerciseKind[] = [
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
    picked.map((item, i) => makeExercise(kinds[i % kinds.length] as ExerciseKind, item, pool, rng, `${prefix}${i}`)),
  );
}

function practiceForNewItems(
  items: readonly KanaItem[],
  pool: readonly KanaItem[],
  speech: boolean,
  rng: Rng,
): Exercise[] {
  // Round 1: recognise each new character in the order it was introduced (gentle start).
  const round1 = items.map((item, i) => makeExercise('kana-to-romaji', item, pool, rng, `p1-${i}`));
  // Round 2: the other direction (listening when a voice exists).
  const round2 = shuffle(items, rng).map((item, i) =>
    makeExercise(speech && i % 2 === 0 ? 'audio-to-kana' : 'romaji-to-kana', item, pool, rng, `p2-${i}`),
  );
  // Round 3: production for every other character.
  const round3 = shuffle(items, rng)
    .filter((_, i) => i % 2 === 0)
    .map((item, i) => makeExercise('type-romaji', item, pool, rng, `p3-${i}`));

  let all = [...round1, ...spreadOut([...round2, ...round3])];
  if (all.length > PRACTICE_CAP) {
    // Large groups (yoon): keep one recognition per item first, then fill.
    const keep = new Set<string>();
    const capped: Exercise[] = [];
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

export function buildLessonPlan(input: PlanInput): LessonPlan {
  const rng = createRng(input.seed);
  const { lesson } = input;
  const lessonItems = uniqueByChar(input.lessonItems);
  const covered = uniqueByChar(input.coveredItems);
  const pool = uniqueByChar([...lessonItems, ...covered, ...input.knownItems]);
  const steps: Step[] = [];

  if (input.dueReviews.length) {
    const reviewItems = uniqueByChar(input.dueReviews);
    steps.push({
      kind: 'review',
      dueTotal: input.dueTotal,
      exercises: reviewItems.map((item, i) =>
        makeExercise(i % 2 === 0 ? 'kana-to-romaji' : 'type-romaji', item, pool, rng, `r${i}`),
      ),
    });
  }

  if (lesson.kind === 'test') {
    steps.push({
      kind: 'practice',
      mode: 'test',
      exercises: mixedExercises(covered, Math.min(TEST_LENGTH, Math.max(covered.length, 8)), pool, input.speech, rng, 't'),
    });
    steps.push({ kind: 'summary', quiz: [] });
    return { n: lesson.n, title: lesson.title, steps };
  }

  if (lessonItems.length) {
    steps.push({
      kind: 'new',
      items: lessonItems,
      groupIds: lesson.newItem.type === 'kana' ? lesson.newItem.groups : [],
    });
    steps.push({
      kind: 'practice',
      mode: 'practice',
      exercises: practiceForNewItems(lessonItems, pool, input.speech, rng),
    });
    steps.push({
      kind: 'summary',
      quiz: sample(lessonItems, QUIZ_LENGTH, rng).map((item, i) =>
        makeExercise('kana-to-romaji', item, pool, rng, `q${i}`),
      ),
    });
  } else {
    // Review lessons (e.g. L16, both alphabets mixed).
    steps.push({
      kind: 'practice',
      mode: 'practice',
      exercises: mixedExercises(covered, Math.min(REVIEW_LESSON_LENGTH, Math.max(covered.length, 4)), pool, input.speech, rng, 'm'),
    });
    steps.push({
      kind: 'summary',
      quiz: sample(covered, QUIZ_LENGTH, rng).map((item, i) => makeExercise('kana-to-romaji', item, pool, rng, `q${i}`)),
    });
  }
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
