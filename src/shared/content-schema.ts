/**
 * Schemas for everything under content/. Used by scripts/validate-content.ts,
 * by tests, and (type-only) by the app. Keep the app importing types only so
 * zod never ends up in the client bundle.
 */
import { z } from 'zod';
import { TEST_EVERY, TOTAL_LESSONS } from './constants.ts';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase kebab-case');

/* -------------------------------------------------------------- curriculum */

export const LessonKind = z.enum(['kana', 'grammar', 'practice', 'test', 'kanji', 'review']);
export type LessonKind = z.infer<typeof LessonKind>;

export const NewItem = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('kana'),
    script: z.enum(['hiragana', 'katakana', 'mixed']),
    /** Kana group ids from content/kana.json, e.g. "h-a", "h-ka", "k-dakuten". */
    groups: z.array(id),
  }),
  z.object({ type: z.literal('grammar'), grammarId: id }),
  z.object({ type: z.literal('kanji'), kanji: z.array(z.string().length(1)).min(1) }),
  z.object({ type: z.literal('none') }),
]);
export type NewItem = z.infer<typeof NewItem>;

export const Lesson = z
  .object({
    n: z.number().int().min(1).max(TOTAL_LESSONS),
    phase: z.enum(['A', 'B', 'C']),
    kind: LessonKind,
    /** Polish title shown in the UI. */
    title: z.string().min(1),
    /** Short Polish one-liner under the title. */
    summary: z.string().min(1),
    newItem: NewItem,
    /** Vocabulary ids from content/vocab.json introduced in this lesson. */
    words: z.array(id),
    /** Kanji introduced alongside the main item (phase C, filled in Phase 6). */
    kanji: z.array(z.string().length(1)).optional(),
    /** For test lessons: inclusive lesson range covered. */
    covers: z.tuple([z.number().int(), z.number().int()]).optional(),
  })
  .strict();
export type Lesson = z.infer<typeof Lesson>;

export const Curriculum = z
  .object({
    version: z.literal(1),
    lessons: z.array(Lesson).length(TOTAL_LESSONS),
  })
  .strict();
export type Curriculum = z.infer<typeof Curriculum>;

/* -------------------------------------------------------------------- kana */

export const Mnemonic = z.object({ pl: z.string().min(1), reviewed: z.boolean() }).strict();

export const KanaChar = z
  .object({
    char: z.string().min(1).max(3),
    /** Modified Hepburn, lowercase (し = shi, を = o, ん = n). */
    romaji: z.string().regex(/^[a-z-]+$/),
    /** Other spellings accepted when typing (si, tu, wo, nn). Never shown as the answer. */
    alt: z.array(z.string().regex(/^[a-z-]+$/)).optional(),
    /** Column in the gojūon chart: 0..4 = a, i, u, e, o. Omitted for yoon/extended. */
    col: z.number().int().min(0).max(4).optional(),
    mnemonic: Mnemonic.optional(),
  })
  .strict();

export const KanaGroup = z
  .object({
    id,
    script: z.enum(['hiragana', 'katakana']),
    label: z.string(),
    kind: z.enum(['basic', 'dakuten', 'yoon', 'small-tsu', 'long-vowel', 'extended']),
    /** Short original Polish explanation shown when the group is introduced. */
    note: Mnemonic.optional(),
    chars: z.array(KanaChar).min(1),
  })
  .strict();
export type KanaGroup = z.infer<typeof KanaGroup>;

export const KanaFile = z.object({ version: z.literal(1), groups: z.array(KanaGroup) }).strict();
export type KanaFile = z.infer<typeof KanaFile>;

/* ----------------------------------------------------------------- strokes */

/** Stroke order data extracted from KanjiVG (CC BY-SA 3.0) by scripts/fetch-kanjivg.ts. */
export const StrokeChar = z
  .object({
    /** SVG path `d` strings in stroke order. */
    strokes: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const StrokesFile = z
  .object({
    version: z.literal(1),
    source: z.literal('kanjivg'),
    /** KanjiVG coordinate space, "0 0 109 109". */
    viewBox: z.string(),
    /** Keyed by the single character. */
    chars: z.record(z.string().length(1), StrokeChar),
  })
  .strict();
export type StrokesFile = z.infer<typeof StrokesFile>;

/* -------------------------------------------------------------- vocabulary */

export const VocabEntry = z
  .object({
    id,
    kana: z.string().min(1),
    kanji: z.string().optional(),
    romaji: z.string().min(1),
    /** English glosses from OpenJLPT (source of the Polish ones). */
    en: z.array(z.string()).min(1),
    pos: z.array(z.string()).optional(),
    /** Tatoeba sentence ids attached to this word. */
    sentences: z.array(z.number().int()).optional(),
    /** Optional source id (OpenJLPT) for traceability. */
    sourceId: z.string().optional(),
  })
  .strict();
export type VocabEntry = z.infer<typeof VocabEntry>;

export const VocabFile = z.object({ version: z.literal(1), words: z.array(VocabEntry) }).strict();

export const Gloss = z
  .object({
    pl: z.array(z.string().min(1)).min(1),
    reviewed: z.boolean(),
  })
  .strict();
export const GlossFile = z
  .object({ version: z.literal(1), glosses: z.record(z.string(), Gloss) })
  .strict();

export const Sentence = z
  .object({
    id: z.number().int(),
    ja: z.string().min(1),
    /** Furigana notation from OpenJLPT: "{会|あ}いましょう". */
    furigana: z.string().optional(),
    /** Kana-only reading for learners before kanji. */
    kana: z.string().optional(),
    en: z.string().min(1),
    pl: z.string().optional(),
    plReviewed: z.boolean().optional(),
    /** Vocabulary ids used, for the "only known words" validator. */
    words: z.array(id),
    /** Words knowingly allowed before they are taught (validator exception). */
    allowUnknown: z.array(id).optional(),
    source: z.enum(['tatoeba', 'original']),
    author: z.string().optional(),
  })
  .strict();
export type Sentence = z.infer<typeof Sentence>;

export const SentenceFile = z
  .object({ version: z.literal(1), sentences: z.array(Sentence) })
  .strict();

/* ---------------------------------------------------------------- examples */

/** One example sentence shown with a word in its lesson (validated against what is taught). */
export const Example = z
  .object({
    wordId: id,
    /** Lesson where the sentence is shown; it may only use what that lesson has taught. */
    lesson: z.number().int().min(1).max(TOTAL_LESSONS),
    /** As naturally written (kanji and kana). */
    ja: z.string().min(1),
    /** Kana-only reading, shown until the kanji are taught (required when ja has kanji). */
    kana: z.string().optional(),
    pl: z.string().min(1),
    source: z.enum(['tatoeba', 'original']),
    tatoebaId: z.number().int().optional(),
    /** Surfaces allowed although unknown to the matcher (names); keep rare. */
    allowUnknown: z.array(z.string()).optional(),
    reviewed: z.boolean(),
  })
  .strict();
export type Example = z.infer<typeof Example>;

export const ExampleFile = z.object({ version: z.literal(1), examples: z.array(Example) }).strict();

/* ------------------------------------------------------------------- kanji */

export const KanjiEntry = z
  .object({
    char: z.string().length(1),
    strokes: z.number().int().positive(),
    on: z.array(z.string()),
    kun: z.array(z.string()),
    en: z.array(z.string()).min(1),
    /** Example words from OpenJLPT (written forms). */
    words: z.array(z.string()),
  })
  .strict();
export type KanjiEntry = z.infer<typeof KanjiEntry>;

export const KanjiFile = z.object({ version: z.literal(1), kanji: z.array(KanjiEntry) }).strict();

/* ----------------------------------------------------------------- grammar */

export const GrammarExample = z
  .object({ ja: z.string(), kana: z.string().optional(), romaji: z.string(), pl: z.string() })
  .strict();

export const GrammarNote = z
  .object({
    id,
    title: z.string(),
    pattern: z.string(),
    /** 3 to 5 sentences in Polish, written for this project. */
    note: z.string().min(1),
    examples: z.array(GrammarExample).length(3),
    typicalMistake: z.string().min(1),
    /** Stays false until the user confirms the note. */
    reviewed: z.boolean(),
  })
  .strict();
export type GrammarNote = z.infer<typeof GrammarNote>;

export const GrammarFile = z
  .object({ version: z.literal(1), notes: z.array(GrammarNote) })
  .strict();

/* ----------------------------------------------------------------- sources */

export const Source = z
  .object({
    id,
    name: z.string(),
    url: z.url(),
    license: z.string(),
    licenseUrl: z.url(),
    attribution: z.string(),
    usedFor: z.string(),
    /** Polish description for the "Źródła i licencje" screen. */
    usedForPl: z.string(),
    /** True once the license text was read at the source (see docs/DECISIONS.md). */
    verified: z.boolean(),
  })
  .strict();
export type Source = z.infer<typeof Source>;

export const SourcesFile = z.object({ version: z.literal(1), sources: z.array(Source) }).strict();

/* ------------------------------------------------------- structural checks */

/** Rules about lesson numbering and kinds that a schema alone cannot express. */
export function curriculumStructureErrors(c: Curriculum): string[] {
  const errors: string[] = [];
  c.lessons.forEach((l, i) => {
    const where = `lesson ${l.n}`;
    if (l.n !== i + 1) errors.push(`${where}: expected n=${i + 1}`);
    const isTestSlot = l.n % TEST_EVERY === 0;
    if (isTestSlot && l.kind !== 'test') errors.push(`${where}: every 7th lesson must be a test`);
    if (!isTestSlot && l.kind === 'test') errors.push(`${where}: tests only on multiples of 7`);
    if (l.kind === 'test' && !l.covers) errors.push(`${where}: test lessons need "covers"`);
    if (l.covers && (l.covers[0] > l.covers[1] || l.covers[1] >= l.n)) {
      errors.push(`${where}: "covers" must be an earlier range`);
    }
    const expectedPhase = l.n <= 16 ? 'A' : l.n <= 60 ? 'B' : 'C';
    if (l.phase !== expectedPhase) errors.push(`${where}: phase should be ${expectedPhase}`);
    if (l.kind === 'kana' && l.n > 16) errors.push(`${where}: kana lessons belong to L1-L16`);
    if (l.kind === 'kana' && l.newItem.type !== 'kana') {
      errors.push(`${where}: kana lesson needs a kana newItem`);
    }
    if (l.kind === 'grammar' && l.newItem.type !== 'grammar') {
      errors.push(`${where}: grammar lesson needs a grammar newItem`);
    }
  });
  return errors;
}
