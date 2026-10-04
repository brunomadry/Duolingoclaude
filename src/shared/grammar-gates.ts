/**
 * Which grammar a sentence may use at a given lesson. Function words (GRAMMAR_WORDS keys
 * from src/shared/jp-words.ts) and inflected forms are each tied to the grammar point that
 * teaches them; the lesson of that grammar point comes from the curriculum. Used by the
 * content pipeline (example sentences) and later by the AI output validator.
 *
 * `null` means "not taught in this N5 course": a sentence using it is above level.
 * Pure: the curriculum and the word-to-lesson map are passed in, so this runs in the
 * browser, the Worker and Node scripts alike.
 */
import type { InflectionForm, Token } from './jp-words.ts';

/** Grammar id (content/curriculum.json newItem.grammarId) per GRAMMAR_WORDS key. */
export const GRAMMAR_KEY_GATES: Readonly<Record<string, string | null>> = {
  // Introduced with the very first sentences.
  wa: 'wa-desu',
  desu: 'wa-desu',
  yo: 'wa-desu',
  ne: 'wa-desu',
  yone: 'wa-desu',
  'o-prefix': 'wa-desu',
  'go-prefix': 'wa-desu',
  san: 'wa-desu',
  chan: 'wa-desu',
  kun: 'wa-desu',
  sama: 'wa-desu',
  // Questions and the polite negative of the copula.
  ka: 'ka-question',
  sou: 'ka-question',
  'ja-arimasen': 'ka-question',
  'dewa-arimasen': 'ka-question',
  'ja-nai': 'ka-question',
  'dewa-nai': 'ka-question',
  // Linking nouns.
  no: 'no-mo',
  mo: 'no-mo',
  to: 'no-mo',
  ya: 'no-mo',
  tachi: 'no-mo',
  // Verbs and objects.
  wo: 'masu-wo',
  masu: 'masu-wo',
  // Time, destination, from/to.
  ni: 'ni-he',
  e: 'ni-he',
  kara: 'ni-he',
  made: 'ni-he',
  de: 'de-place-means',
  // Past and negative.
  masen: 'masen-mashita',
  mashita: 'masen-mashita',
  'masen-deshita': 'masen-mashita',
  deshita: 'masen-mashita',
  'ja-arimasen-deshita': 'masen-mashita',
  'dewa-arimasen-deshita': 'masen-mashita',
  // Adjectives (が for likes and skills comes with 好き/上手).
  na: 'na-adjectives',
  ga: 'na-adjectives',
  gozaimasu: 'arimasu-imasu',
  // Numbers, time and counters.
  ji: 'numbers-time',
  fun: 'numbers-time',
  byou: 'numbers-time',
  goro: 'numbers-time',
  nichi: 'counters',
  gatsu: 'counters',
  youbi: 'counters',
  nen: 'counters',
  shuukan: 'counters',
  kagetsu: 'counters',
  en: 'counters',
  nin: 'counters',
  sai: 'counters',
  tsu: 'counters',
  ko: 'counters',
  hon: 'counters',
  mai: 'counters',
  satsu: 'counters',
  hiki: 'counters',
  dai: 'counters',
  kai: 'counters',
  'kai-floor': 'counters',
  hai: 'counters',
  ban: 'counters',
  do: 'counters',
  dake: 'counters',
  kurai: 'counters',
  gurai: 'counters',
  nado: 'counters',
  shika: 'counters',
  // Wishes and suggestions.
  mashou: 'tai-mashou',
  // Comparisons.
  yori: 'yori-hou',
  hou: 'yori-hou',
  // Reasons and contrast.
  'ga-but': 'kara-demo',
  demo: 'kara-demo',
  kedo: 'kara-demo',
  keredo: 'kara-demo',
  node: 'kara-demo',
  // Plain speech.
  da: 'plain-da',
  datta: 'plain-ta',
  'ja-nakatta': 'plain-nakatta',
  'dewa-nakatta': 'plain-nakatta',
  ikenai: 'plain-nai',
  koto: 'plain-dictionary',
  'ja-naku': 'adjectives-plain',
  'dewa-naku': 'adjectives-plain',
  n: 'casual-speech',
  toki: 'mae-ato',
  deshou: 'deshou',
  darou: 'deshou',
  you: 'naru',
  // Above N5 in this course.
  shimau: null,
};

/** Grammar id per inflected form of a word. */
export const FORM_GATES: Readonly<Record<InflectionForm, string | null>> = {
  dict: 'plain-dictionary',
  stem: 'ni-he',
  masu: 'masu-wo',
  mashita: 'masen-mashita',
  masen: 'masen-mashita',
  'masen-deshita': 'masen-mashita',
  mashou: 'tai-mashou',
  'mashou-ka': 'tai-mashou',
  tai: 'tai-mashou',
  takunai: 'tai-mashou',
  takatta: 'tai-mashou',
  takunakatta: 'tai-mashou',
  takute: 'adjectives-plain',
  te: 'te-form',
  ta: 'plain-ta',
  nai: 'plain-nai',
  nakatta: 'plain-nakatta',
  naku: 'plain-nai',
  nakute: 'plain-nai',
  naide: 'plain-nai',
  ku: 'i-adjectives',
  kunai: 'i-adjectives',
  katta: 'i-adjectives',
  kunakatta: 'i-adjectives',
  kute: 'adjectives-plain',
  kunakute: 'adjectives-plain',
  // N4 in this course.
  tara: null,
  tari: null,
  volitional: null,
  nagara: null,
  nasai: null,
  kattara: null,
};

const VERB_POS = /^v(?:1|5|k|s-i|z)/;

export interface GateCurriculum {
  lessons: readonly { n: number; newItem: { type: string; grammarId?: string } }[];
}

export interface Gates {
  /** Lesson where a grammar id is taught, or null if not in the course. */
  lessonOfGrammar(id: string | null): number | null;
  keyLesson(key: string): number | null;
  formLesson(form: InflectionForm): number | null;
  numbersLesson: number | null;
}

export function createGates(curriculum: GateCurriculum): Gates {
  const byId = new Map<string, number>();
  for (const l of curriculum.lessons) {
    if (l.newItem.type === 'grammar' && l.newItem.grammarId && !byId.has(l.newItem.grammarId)) {
      byId.set(l.newItem.grammarId, l.n);
    }
  }
  const lessonOfGrammar = (id: string | null) => (id === null ? null : (byId.get(id) ?? null));
  return {
    lessonOfGrammar,
    keyLesson: (key) =>
      key in GRAMMAR_KEY_GATES ? lessonOfGrammar(GRAMMAR_KEY_GATES[key] ?? null) : null,
    formLesson: (form) => lessonOfGrammar(FORM_GATES[form] ?? null),
    numbersLesson: lessonOfGrammar('numbers-time'),
  };
}

export interface CheckContext {
  lessonN: number;
  gates: Gates;
  /** Lesson where each vocabulary id is taught. */
  lessonOfWord: ReadonlyMap<string, number>;
  /** Part-of-speech tags per vocabulary id (to spot plain dictionary-form verbs). */
  posOfWord: ReadonlyMap<string, readonly string[]>;
  /** Surfaces knowingly allowed although unknown (names, flagged exceptions). */
  allowSurfaces?: ReadonlySet<string>;
}

export interface SentenceCheck {
  ok: boolean;
  /** Polish-agnostic English problem descriptions for the content report. */
  problems: string[];
  /** Vocabulary ids used (first acceptable candidate per word token). */
  wordIds: string[];
}

const okAt = (lesson: number | null, n: number) => lesson !== null && lesson <= n;

/** Checks that every token of a sentence is taught by lesson `ctx.lessonN`. */
export function checkTokens(tokens: readonly Token[], ctx: CheckContext): SentenceCheck {
  const problems: string[] = [];
  const wordIds: string[] = [];
  const n = ctx.lessonN;
  for (const t of tokens) {
    switch (t.kind) {
      case 'punct':
        break;
      case 'number':
        if (!okAt(ctx.gates.numbersLesson, n))
          problems.push(`number "${t.surface}" before numbers are taught`);
        break;
      case 'grammar': {
        const at = ctx.gates.keyLesson(t.grammar ?? '');
        if (!okAt(at, n))
          problems.push(
            `grammar "${t.surface}" (${t.grammar}) ${at === null ? 'is above N5' : `taught in lesson ${at}`}`,
          );
        break;
      }
      case 'word': {
        // Several candidates (きて: 着る or 来る): accept the sentence if any of them is taught.
        const taught = t.wordIds.filter((id) => okAt(ctx.lessonOfWord.get(id) ?? null, n));
        const alt = t.grammar ? ctx.gates.keyLesson(t.grammar) : null;
        if (!taught.length) {
          if (okAt(alt, n)) break;
          const later = t.wordIds
            .map((id) => ctx.lessonOfWord.get(id))
            .filter((x): x is number => x !== undefined);
          problems.push(
            `word "${t.surface}" ${later.length ? `taught in lesson ${Math.min(...later)}` : 'is never taught'}`,
          );
          break;
        }
        const id = taught[0] as string;
        wordIds.push(id);
        const isVerb = (ctx.posOfWord.get(id) ?? []).some((p) => VERB_POS.test(p));
        const form: InflectionForm | undefined = t.form ?? (isVerb ? 'dict' : undefined);
        if (form) {
          const at = ctx.gates.formLesson(form);
          if (!okAt(at, n)) {
            problems.push(
              `form "${t.surface}" (${form}) ${at === null ? 'is above N5' : `taught in lesson ${at}`}`,
            );
          }
        }
        break;
      }
      default:
        if (!ctx.allowSurfaces?.has(t.surface)) problems.push(`unknown "${t.surface}"`);
    }
  }
  return { ok: problems.length === 0, problems, wordIds: [...new Set(wordIds)] };
}

/**
 * Checks that a kana reading spells the same words as the written sentence: every word of
 * the written form must appear, in order, in the reading. Extra reading tokens are fine
 * (３時 is read さんじ), and a lone unknown kana matches any word (single-kana words such
 * as 目 め or 手 て are not in the matcher). Anything else unknown in the reading is a
 * problem unless knowingly allowed.
 */
export function readingProblems(
  written: readonly Token[],
  reading: readonly Token[],
  allowSurfaces?: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const lone = (t: Token) => t.kind === 'unknown' && [...t.surface].length === 1;
  for (const t of reading) {
    if (t.kind === 'unknown' && !lone(t) && !allowSurfaces?.has(t.surface))
      problems.push(`reading has unknown "${t.surface}"`);
  }
  const candidates = reading.filter((t) => t.kind === 'word' || lone(t));
  let i = 0;
  for (const t of written) {
    if (t.kind !== 'word') continue;
    let found = false;
    while (i < candidates.length && !found) {
      const c = candidates[i++] as Token;
      found = lone(c) || c.wordIds.some((id) => t.wordIds.includes(id));
    }
    if (!found) {
      problems.push(`reading does not spell "${t.surface}"`);
      break;
    }
  }
  return problems;
}
