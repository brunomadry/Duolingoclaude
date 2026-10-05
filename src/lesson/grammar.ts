/**
 * Grammar notes for the client: the note text plus its examples analysed as practice
 * sentences, and the sentence bank (lesson examples and note examples) for grammar lessons.
 * Pure: content and the tokenizer are passed in (see src/data/course-data.ts).
 */
import type { Token } from '../shared/jp-words.ts';
import { sentenceRomaji } from './sentence-romaji.ts';
import { analyseSentence, type SentenceItem, type SentenceSource } from './sentences.ts';

export interface GrammarNoteItem {
  id: string;
  title: string;
  pattern: string;
  note: string;
  typicalMistake: string;
  reviewed: boolean;
  /** Lesson that teaches the point. */
  lesson: number;
  examples: SentenceItem[];
}

export interface RawGrammar {
  notes: {
    id: string;
    title: string;
    pattern: string;
    note: string;
    typicalMistake: string;
    reviewed: boolean;
    examples: { ja: string; kana?: string; romaji?: string; pl: string }[];
  }[];
}

export interface RawExampleSentences {
  examples: {
    wordId: string;
    lesson: number;
    ja: string;
    kana?: string;
    romaji?: string;
    pl: string;
    tatoebaId?: number;
  }[];
}

export interface SentenceTools {
  tokenize: (text: string) => Token[];
  isVerb: (wordId: string) => boolean;
  word: (id: string) => { kana: string; romaji: string } | undefined;
}

/** Analyses one sentence (romaji generated from the reading when missing). */
export function sentenceItem(source: SentenceSource, tools: SentenceTools): SentenceItem {
  const reading = source.kana ?? source.ja;
  const tokens = tools.tokenize(reading);
  const romaji = source.romaji ?? sentenceRomaji(tokens, tools.word);
  return analyseSentence({ ...source, romaji }, tokens, tools.isVerb);
}

export interface GrammarIndex {
  notes: ReadonlyMap<string, GrammarNoteItem>;
  /** Every practice sentence, ordered by lesson. */
  sentences: SentenceItem[];
}

export function buildGrammarIndex(
  lessonOfGrammar: (id: string) => number | null,
  tools: SentenceTools,
  grammar?: RawGrammar,
  examples?: RawExampleSentences,
): GrammarIndex {
  const notes = new Map<string, GrammarNoteItem>();
  const sentences: SentenceItem[] = [];
  for (const raw of grammar?.notes ?? []) {
    const lesson = lessonOfGrammar(raw.id);
    if (lesson === null) continue;
    const items = raw.examples.map((ex, i) =>
      sentenceItem(
        {
          id: `gr:${raw.id}:${i}`,
          ja: ex.ja,
          pl: ex.pl,
          lesson,
          ...(ex.kana ? { kana: ex.kana } : {}),
          ...(ex.romaji ? { romaji: ex.romaji } : {}),
        },
        tools,
      ),
    );
    notes.set(raw.id, {
      id: raw.id,
      title: raw.title,
      pattern: raw.pattern,
      note: raw.note,
      typicalMistake: raw.typicalMistake,
      reviewed: raw.reviewed,
      lesson,
      examples: items,
    });
    sentences.push(...items);
  }
  for (const ex of examples?.examples ?? []) {
    sentences.push(
      sentenceItem(
        {
          id: `ex:${ex.wordId}`,
          ja: ex.ja,
          pl: ex.pl,
          lesson: ex.lesson,
          ...(ex.kana ? { kana: ex.kana } : {}),
          ...(ex.romaji ? { romaji: ex.romaji } : {}),
          ...(ex.tatoebaId !== undefined ? { tatoebaId: ex.tatoebaId } : {}),
        },
        tools,
      ),
    );
  }
  sentences.sort((a, b) => a.lesson - b.lesson);
  return { notes, sentences };
}

/** Sentences a learner can read by the end of lesson n. */
export function sentencesUpTo(index: GrammarIndex, n: number): SentenceItem[] {
  return index.sentences.filter((s) => s.lesson <= n);
}

/**
 * Sentences that practise a grammar point: they use it, or a word taught with it (for
 * points carried by words, such as これ or あります). Newest first.
 */
export function sentencesFor(
  pool: readonly SentenceItem[],
  grammarId: string,
  lessonWords: ReadonlySet<string>,
): SentenceItem[] {
  return pool
    .filter((s) => s.grammar.includes(grammarId) || s.words.some((w) => lessonWords.has(w)))
    .sort((a, b) => b.lesson - a.lesson);
}
