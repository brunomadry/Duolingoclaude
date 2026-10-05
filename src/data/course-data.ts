/**
 * Everything grammar lessons need, loaded lazily on top of the vocabulary: the word
 * matcher (to cut sentences into tiles), grammar notes and the sentence bank. Grammar notes
 * are optional content until the course has them.
 */
import {
  buildGrammarIndex,
  sentenceItem,
  type GrammarIndex,
  type RawExampleSentences,
  type RawGrammar,
} from '../lesson/grammar.ts';
import { gates } from '../lesson/context.ts';
import type { SentenceItem, SentenceSource } from '../lesson/sentences.ts';
import type { VocabIndex } from '../lesson/vocab.ts';
import { loadVocab } from './vocab-data.ts';

const optionalGrammar = import.meta.glob<RawGrammar>('../../content/grammar.json', {
  import: 'default',
});
const optionalExamples = import.meta.glob<RawExampleSentences>('../../content/examples.json', {
  import: 'default',
});

export interface CourseData {
  vocab: VocabIndex;
  grammar: GrammarIndex;
  /** Analyses a sentence from elsewhere (AI practice) like the course's own. */
  sentence: (source: SentenceSource) => SentenceItem;
}

const VERB_POS = /^v(?:1|5|k|s-i|z)/;

let pending: Promise<CourseData> | null = null;

export function loadCourse(): Promise<CourseData> {
  if (!pending) {
    const grammarFile = Object.values(optionalGrammar)[0];
    const examplesFile = Object.values(optionalExamples)[0];
    pending = Promise.all([
      loadVocab(),
      import('../shared/jp-words.ts'),
      grammarFile ? grammarFile() : Promise.resolve(undefined),
      examplesFile ? examplesFile() : Promise.resolve(undefined),
    ]).then(([vocab, words, grammar, examples]) => {
      const lexicon = words.createLexicon(
        vocab.words.map((w) => ({
          id: w.id,
          kana: w.kana,
          pos: w.pos,
          ...(w.kanji ? { kanji: w.kanji } : {}),
        })),
      );
      const tools = {
        tokenize: (text: string) => words.tokenize(text, lexicon),
        isVerb: (id: string) => (vocab.byId.get(id)?.pos ?? []).some((p) => VERB_POS.test(p)),
        word: (id: string) => vocab.byId.get(id),
      };
      const index = buildGrammarIndex((id) => gates.lessonOfGrammar(id), tools, grammar, examples);
      return { vocab, grammar: index, sentence: (src) => sentenceItem(src, tools) };
    });
    // A failed chunk load (offline before the first visit) may succeed on the next try.
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
