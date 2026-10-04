/**
 * Vocabulary model for the client: one WordItem per N5 word with its Polish senses, the
 * lesson that teaches it (null for bonus words outside the lessons) and its example
 * sentence. Pure: the raw content files are passed in (see src/data/vocab-data.ts).
 */
import { isRomajiAnswerCorrect } from './romaji.ts';

export interface WordExample {
  ja: string;
  /** Kana reading with spaces between phrases. */
  kana?: string;
  /** Romaji generated from the reading, particles as pronounced. */
  romaji?: string;
  pl: string;
  tatoebaId?: number;
}

export interface WordItem {
  id: string;
  kana: string;
  kanji?: string;
  romaji: string;
  /** Polish senses, most common first (never empty). */
  pl: string[];
  pos: string[];
  /** Lesson that teaches the word, or null for bonus vocabulary. */
  lesson: number | null;
  example?: WordExample;
}

export interface RawVocab {
  words: {
    id: string;
    kana: string;
    kanji?: string;
    romaji: string;
    en: string[];
    pos?: string[];
  }[];
}
export interface RawGlosses {
  glosses: Record<string, { pl: string[] }>;
}
export interface RawExamples {
  examples: (WordExample & { wordId: string; lesson: number })[];
}
export interface RawCurriculum {
  lessons: { n: number; words: readonly string[] }[];
}

export interface VocabIndex {
  /** Every word in gojūon order of the kana. */
  words: WordItem[];
  byId: ReadonlyMap<string, WordItem>;
  /** Words taught by each lesson, in curriculum order. */
  byLesson: ReadonlyMap<number, WordItem[]>;
}

export const VOCAB_CARD_PREFIX = 'vocab:';

export function vocabCardId(wordId: string): string {
  return `${VOCAB_CARD_PREFIX}${wordId}`;
}

export function wordIdFromCardId(cardId: string): string | null {
  return cardId.startsWith(VOCAB_CARD_PREFIX) ? cardId.slice(VOCAB_CARD_PREFIX.length) : null;
}

export function buildVocabIndex(
  vocab: RawVocab,
  glosses: RawGlosses,
  curriculum: RawCurriculum,
  examples?: RawExamples,
): VocabIndex {
  const lessonOf = new Map<string, number>();
  for (const l of curriculum.lessons) for (const w of l.words) lessonOf.set(w, l.n);
  const exampleOf = new Map<string, WordExample>();
  for (const ex of examples?.examples ?? []) {
    // The example shown with a word is the one from the lesson that teaches it.
    if (lessonOf.get(ex.wordId) !== ex.lesson || exampleOf.has(ex.wordId)) continue;
    exampleOf.set(ex.wordId, {
      ja: ex.ja,
      pl: ex.pl,
      ...(ex.kana ? { kana: ex.kana } : {}),
      ...(ex.romaji ? { romaji: ex.romaji } : {}),
      ...(ex.tatoebaId !== undefined ? { tatoebaId: ex.tatoebaId } : {}),
    });
  }
  const words: WordItem[] = vocab.words.map((w) => {
    const pl = glosses.glosses[w.id]?.pl ?? [];
    const example = exampleOf.get(w.id);
    return {
      id: w.id,
      kana: w.kana,
      ...(w.kanji ? { kanji: w.kanji } : {}),
      romaji: w.romaji,
      // A missing gloss falls back to English rather than an empty card.
      pl: pl.length ? pl : w.en.slice(0, 2),
      pos: w.pos ?? [],
      lesson: lessonOf.get(w.id) ?? null,
      ...(example ? { example } : {}),
    };
  });
  const byId = new Map(words.map((w) => [w.id, w]));
  const byLesson = new Map<number, WordItem[]>();
  for (const l of curriculum.lessons) {
    const items = l.words.map((id) => byId.get(id)).filter((w): w is WordItem => !!w);
    if (items.length) byLesson.set(l.n, items);
  }
  return { words, byId, byLesson };
}

/** Words taught by lessons 1..upTo (inclusive), in lesson order. */
export function wordsUpTo(index: VocabIndex, upTo: number): WordItem[] {
  const out: WordItem[] = [];
  for (const [n, items] of [...index.byLesson].sort((a, b) => a[0] - b[0])) {
    if (n <= upTo) out.push(...items);
  }
  return out;
}

export function isKatakanaWord(word: Pick<WordItem, 'kana'>): boolean {
  return /^[゠-ヿー・]+$/.test(word.kana);
}

/** Typed romaji (or kana from a Japanese keyboard) for a word; spacing and case are ignored. */
export function isWordAnswerCorrect(
  word: Pick<WordItem, 'kana' | 'romaji'>,
  input: string,
): boolean {
  const typed = input
    .trim()
    .toLowerCase()
    .replace(/[\s'’]+/g, '');
  if (!typed) return false;
  if (typed === word.romaji.replace(/[\s']+/g, '') || typed === word.kana) return true;
  return isRomajiAnswerCorrect(input, word.kana);
}

/** The first sense, without a trailing note in parentheses ("ojciec (własny)" -> "ojciec"). */
export function shortMeaning(word: Pick<WordItem, 'pl'>): string {
  const first = word.pl[0] ?? '';
  return first.replace(/\s*\([^)]*\)\s*$/, '') || first;
}

/** Folds case and Polish diacritics so "zolty" finds "żółty". */
export function foldPolish(text: string): string {
  return text.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const toHiragana = (text: string) =>
  text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/**
 * Words matching a query in kana (either script), kanji, romaji or Polish. Exact and prefix
 * matches come first, then other matches, each group in the input order.
 */
export function searchWords(words: readonly WordItem[], query: string): WordItem[] {
  const q = query.trim();
  if (!q) return [...words];
  const qPl = foldPolish(q);
  const qKana = toHiragana(q);
  const qRomaji = q.toLowerCase().replace(/[\s'-]/g, '');
  const scored: { w: WordItem; score: number; i: number }[] = [];
  words.forEach((w, i) => {
    const kana = toHiragana(w.kana);
    const romaji = w.romaji.replace(/[\s'-]/g, '');
    const senses = w.pl.map(foldPolish);
    let score = 0;
    if (kana === qKana || w.kanji === q || romaji === qRomaji) score = 3;
    else if (senses.some((s) => s === qPl || s.split(/[,;]\s*/).includes(qPl))) score = 3;
    else if (kana.startsWith(qKana) || romaji.startsWith(qRomaji)) score = 2;
    else if (senses.some((s) => s.startsWith(qPl) || s.includes(` ${qPl}`))) score = 2;
    else if (
      kana.includes(qKana) ||
      (w.kanji?.includes(q) ?? false) ||
      (qRomaji.length > 2 && romaji.includes(qRomaji)) ||
      (qPl.length > 2 && senses.some((s) => s.includes(qPl)))
    )
      score = 1;
    if (score) scored.push({ w, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.w);
}

const POS_LABELS: readonly [RegExp, string][] = [
  [/^v/, 'czasownik'],
  [/^adj-i$|^adj-ix$/, 'przymiotnik -i'],
  [/^adj-na$/, 'przymiotnik -na'],
  [/^adj-pn$/, 'określnik'],
  [/^adv/, 'przysłówek'],
  [/^pn$/, 'zaimek'],
  [/^num$/, 'liczebnik'],
  [/^ctr$/, 'licznik'],
  [/^conj$/, 'spójnik'],
  [/^int$/, 'zwrot'],
  [/^exp$/, 'wyrażenie'],
  [/^n/, 'rzeczownik'],
];

/** A short Polish label for the word's main part of speech. */
export function posLabel(pos: readonly string[]): string | null {
  for (const p of pos) {
    for (const [re, label] of POS_LABELS) if (re.test(p)) return label;
  }
  return null;
}
