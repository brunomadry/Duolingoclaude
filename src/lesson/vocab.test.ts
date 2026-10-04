import { describe, expect, it } from 'vitest';
import {
  buildVocabIndex,
  foldPolish,
  isKatakanaWord,
  isWordAnswerCorrect,
  posLabel,
  searchWords,
  shortMeaning,
  vocabCardId,
  wordIdFromCardId,
  wordsUpTo,
  type RawVocab,
} from './vocab.ts';

const vocab: RawVocab = {
  words: [
    { id: 'inu', kana: 'いぬ', kanji: '犬', romaji: 'inu', en: ['dog'], pos: ['n'] },
    { id: 'koohii', kana: 'コーヒー', romaji: 'koohii', en: ['coffee'], pos: ['n'] },
    {
      id: 'kiiroi',
      kana: 'きいろい',
      kanji: '黄色い',
      romaji: 'kiiroi',
      en: ['yellow'],
      pos: ['adj-i'],
    },
    {
      id: 'chichi',
      kana: 'ちち',
      kanji: '父',
      romaji: 'chichi',
      en: ['(humble) father'],
      pos: ['n'],
    },
    {
      id: 'taberu',
      kana: 'たべる',
      kanji: '食べる',
      romaji: 'taberu',
      en: ['to eat'],
      pos: ['v1', 'vt'],
    },
  ],
};
const glosses = {
  glosses: {
    inu: { pl: ['pies'] },
    koohii: { pl: ['kawa'] },
    kiiroi: { pl: ['żółty'] },
    chichi: { pl: ['ojciec (własny)', 'tata (własny)'] },
  },
};
const curriculum = {
  lessons: [
    { n: 4, words: ['inu'] },
    { n: 9, words: ['koohii', 'chichi'] },
    { n: 38, words: ['kiiroi'] },
  ],
};
const examples = {
  examples: [
    {
      wordId: 'kiiroi',
      lesson: 38,
      ja: '黄色い花です。',
      kana: 'きいろい はなです。',
      pl: 'To żółty kwiat.',
    },
    // Shown in another lesson than the word's own: not the word's example.
    { wordId: 'inu', lesson: 40, ja: '犬が好きです。', pl: 'Lubię psy.' },
  ],
};

const index = buildVocabIndex(vocab, glosses, curriculum, examples);

describe('buildVocabIndex', () => {
  it('joins words, Polish glosses, lessons and examples', () => {
    expect(index.byId.get('inu')).toMatchObject({ pl: ['pies'], lesson: 4, kanji: '犬' });
    expect(index.byId.get('inu')?.example).toBeUndefined();
    expect(index.byId.get('kiiroi')?.example).toEqual({
      ja: '黄色い花です。',
      kana: 'きいろい はなです。',
      pl: 'To żółty kwiat.',
    });
    // Bonus word: no lesson; missing gloss falls back to English.
    expect(index.byId.get('taberu')).toMatchObject({ lesson: null, pl: ['to eat'] });
    expect(index.byLesson.get(9)?.map((w) => w.id)).toEqual(['koohii', 'chichi']);
  });

  it('lists words taught up to a lesson in lesson order', () => {
    expect(wordsUpTo(index, 9).map((w) => w.id)).toEqual(['inu', 'koohii', 'chichi']);
    expect(wordsUpTo(index, 3)).toEqual([]);
  });
});

describe('search', () => {
  const ids = (q: string) => searchWords(index.words, q).map((w) => w.id);

  it('finds words by kana in either script, kanji, romaji and Polish', () => {
    expect(ids('いぬ')).toEqual(['inu']);
    expect(ids('こーひー')).toEqual(['koohii']);
    expect(ids('犬')).toEqual(['inu']);
    expect(ids('tab')).toEqual(['taberu']);
    expect(ids('zolty')).toEqual(['kiiroi']);
    expect(ids('TATA')).toEqual(['chichi']);
  });

  it('ranks exact matches first and keeps everything for an empty query', () => {
    expect(ids('kawa')[0]).toBe('koohii');
    expect(ids('  ')).toHaveLength(vocab.words.length);
  });
});

describe('helpers', () => {
  it('maps card ids both ways', () => {
    expect(wordIdFromCardId(vocabCardId('inu'))).toBe('inu');
    expect(wordIdFromCardId('kana:あ')).toBeNull();
  });

  it('folds Polish diacritics', () => {
    expect(foldPolish('Żółć Łódź')).toBe('zolc lodz');
  });

  it('labels parts of speech and shortens meanings', () => {
    expect(posLabel(['v1', 'vt'])).toBe('czasownik');
    expect(posLabel(['adj-i'])).toBe('przymiotnik -i');
    expect(posLabel(['n', 'adj-no'])).toBe('rzeczownik');
    expect(posLabel([])).toBeNull();
    expect(shortMeaning({ pl: ['ojciec (własny)'] })).toBe('ojciec');
  });

  it('tells katakana words apart', () => {
    expect(isKatakanaWord({ kana: 'コーヒー' })).toBe(true);
    expect(isKatakanaWord({ kana: 'いぬ' })).toBe(false);
  });

  it('accepts typed romaji in common spellings, and kana', () => {
    const coffee = { kana: 'コーヒー', romaji: 'koohii' };
    expect(isWordAnswerCorrect(coffee, 'koohii')).toBe(true);
    expect(isWordAnswerCorrect(coffee, ' Kōhī ')).toBe(true);
    expect(isWordAnswerCorrect(coffee, 'コーヒー')).toBe(true);
    expect(isWordAnswerCorrect(coffee, 'kohi')).toBe(false);
    expect(isWordAnswerCorrect({ kana: 'ちち', romaji: 'chichi' }, 'titi')).toBe(true);
    expect(isWordAnswerCorrect({ kana: 'ちち', romaji: 'chichi' }, '')).toBe(false);
  });
});
