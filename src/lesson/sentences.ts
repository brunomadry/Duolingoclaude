/**
 * Sentences for grammar practice: lesson examples and grammar-note examples analysed with
 * the known-word matcher (src/shared/jp-words.ts) into kana tiles, particle gaps and the
 * grammar points they use. Pure: tokens come from the caller.
 */
import { grammarOfTokens } from '../shared/grammar-gates.ts';
import type { Token } from '../shared/jp-words.ts';

export interface SentenceSource {
  /** Stable id: "ex:<wordId>" for lesson examples, "gr:<grammarId>:<n>" for note examples. */
  id: string;
  ja: string;
  /** Kana reading with spaces between phrases. */
  kana?: string;
  romaji?: string;
  pl: string;
  /** Lesson from which the sentence may be shown. */
  lesson: number;
  tatoebaId?: number;
}

export interface Gap {
  /** Index into `tiles`. */
  index: number;
  /** GRAMMAR_WORDS key of the particle. */
  key: string;
}

export interface SentenceItem extends SentenceSource {
  kana: string;
  /** Grammar ids (content/curriculum.json) the sentence uses. */
  grammar: string[];
  /** Vocabulary ids it uses. */
  words: string[];
  /** Kana tiles in order, without spaces and punctuation. */
  tiles: string[];
  /** Particles that can be blanked out for a gap-fill exercise. */
  gaps: Gap[];
}

/** Particles used in gap-fill exercises, with their kana. */
export const GAP_PARTICLES: Readonly<Record<string, string>> = {
  wa: 'は',
  ga: 'が',
  wo: 'を',
  ni: 'に',
  e: 'へ',
  de: 'で',
  to: 'と',
  mo: 'も',
  no: 'の',
  ka: 'か',
  ya: 'や',
  kara: 'から',
  made: 'まで',
  yori: 'より',
};

/**
 * Pairs that are both right in many sentences (に and へ with a destination, は and が, と
 * and や): never offered against each other.
 */
const INTERCHANGEABLE: readonly (readonly [string, string])[] = [
  ['ni', 'e'],
  ['wa', 'ga'],
  ['to', 'ya'],
];

export function interchangeable(a: string, b: string): boolean {
  return INTERCHANGEABLE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

const isTile = (t: Token) => t.kind !== 'punct' && t.surface.trim() !== '';

export function analyseSentence(
  source: SentenceSource,
  readingTokens: readonly Token[],
  isVerb: (wordId: string) => boolean,
): SentenceItem {
  const grammar = grammarOfTokens(readingTokens, isVerb);
  const words = new Set<string>();
  const tiles: string[] = [];
  const gaps: Gap[] = [];
  for (const t of readingTokens) {
    if (!isTile(t)) continue;
    if (t.kind === 'grammar' && t.grammar && t.grammar in GAP_PARTICLES)
      gaps.push({ index: tiles.length, key: t.grammar });
    if (t.kind === 'word' && t.wordIds[0]) words.add(t.wordIds[0]);
    tiles.push(t.surface);
  }
  return {
    ...source,
    kana: source.kana ?? source.ja,
    grammar: [...grammar],
    words: [...words],
    tiles,
    gaps,
  };
}

/** Same tiles, in order? (Tiles are compared as text, so equal tiles are interchangeable.) */
export function tilesMatch(answer: readonly string[], expected: readonly string[]): boolean {
  return answer.length === expected.length && answer.every((t, i) => t === expected[i]);
}
