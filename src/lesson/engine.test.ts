import { describe, expect, it } from 'vitest';
import {
  PRACTICE_CAP,
  QUIZ_LENGTH,
  TEST_LENGTH,
  WORD_PRACTICE_CAP,
  buildLessonPlan,
  charFromCardId,
  gradesFromResults,
  isKanaExercise,
  isWordExercise,
  kanaCardId,
  scoreOf,
  type Exercise,
  type KanaExercise,
  type KanaItem,
  type PlanInput,
} from './engine.ts';
import type { WordItem } from './vocab.ts';

const H = (char: string, romaji: string): KanaItem => ({ char, romaji, script: 'hiragana' });
const K = (char: string, romaji: string): KanaItem => ({ char, romaji, script: 'katakana' });

const VOWELS = [H('あ', 'a'), H('い', 'i'), H('う', 'u'), H('え', 'e'), H('お', 'o')];
const KA = [H('か', 'ka'), H('き', 'ki'), H('く', 'ku'), H('け', 'ke'), H('こ', 'ko')];
const L1 = [...VOWELS, ...KA];

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    lesson: {
      n: 1,
      kind: 'kana',
      title: 'Hiragana',
      newItem: { type: 'kana', script: 'hiragana', groups: ['h-a', 'h-ka'] },
    },
    lessonItems: L1,
    coveredItems: [],
    knownItems: [],
    dueReviews: [],
    dueTotal: 0,
    speech: true,
    seed: 42,
    ...over,
  };
}

const kana = (e: Exercise): KanaExercise => {
  if (!isKanaExercise(e)) throw new Error(`word exercise ${e.id}`);
  return e;
};

const exercisesOf = (plan: ReturnType<typeof buildLessonPlan>): Exercise[] =>
  plan.steps.flatMap((s) => ('exercises' in s ? s.exercises : 'quiz' in s ? s.quiz : []));

describe('buildLessonPlan: kana lesson', () => {
  it('follows new -> practice -> summary when nothing is due', () => {
    const plan = buildLessonPlan(input());
    expect(plan.steps.map((s) => s.kind)).toEqual(['new', 'practice', 'summary']);
  });

  it('starts with reviews when cards are due', () => {
    const plan = buildLessonPlan(input({ dueReviews: [H('さ', 'sa')], dueTotal: 30 }));
    expect(plan.steps[0]).toMatchObject({ kind: 'review', dueTotal: 30 });
  });

  it('is deterministic for a seed and varies with it', () => {
    expect(buildLessonPlan(input())).toEqual(buildLessonPlan(input()));
    expect(JSON.stringify(buildLessonPlan(input({ seed: 7 })))).not.toBe(
      JSON.stringify(buildLessonPlan(input())),
    );
  });

  it('practises every new character, recognition first in intro order', () => {
    const practice = buildLessonPlan(input()).steps.find((s) => s.kind === 'practice');
    if (practice?.kind !== 'practice') throw new Error('no practice');
    expect(practice.exercises.slice(0, L1.length).map((e) => kana(e).item.char)).toEqual(
      L1.map((i) => i.char),
    );
    expect(new Set(practice.exercises.map((e) => kana(e).item.char))).toEqual(
      new Set(L1.map((i) => i.char)),
    );
    expect(practice.exercises.length).toBeLessThanOrEqual(PRACTICE_CAP);
  });

  it('builds valid options: answer included, unique, never another reading of the same sound', () => {
    const items = [...L1, H('じ', 'ji'), H('ぢ', 'ji'), H('ず', 'zu'), H('づ', 'zu')];
    const plan = buildLessonPlan(input({ lessonItems: items }));
    for (const e of exercisesOf(plan)) {
      if (e.kind === 'type-romaji') {
        expect(e.options).toEqual([]);
        continue;
      }
      expect(e.options).toContain(e.answer);
      expect(new Set(e.options).size).toBe(e.options.length);
      expect(e.options.length).toBeGreaterThanOrEqual(2);
      expect(e.options.length).toBeLessThanOrEqual(4);
      if (kana(e).item.char === 'じ' && e.kind !== 'kana-to-romaji')
        expect(e.options).not.toContain('ぢ');
    }
  });

  it('never offers a distractor that is also a correct reading (ヲ o/wo vs ウォ wo)', () => {
    const wo: KanaItem = { char: 'ヲ', romaji: 'o', alt: ['wo'], script: 'katakana' };
    const uo: KanaItem = { char: 'ウォ', romaji: 'wo', script: 'katakana' };
    const others = [K('カ', 'ka'), K('キ', 'ki'), K('ク', 'ku'), K('ケ', 'ke')];
    for (let seed = 0; seed < 20; seed++) {
      const plan = buildLessonPlan(input({ lessonItems: [wo, uo, ...others], seed }));
      for (const e of exercisesOf(plan)) {
        if (kana(e).item.char === 'ヲ')
          expect(e.options).not.toContain(e.kind === 'kana-to-romaji' ? 'wo' : 'ウォ');
        if (kana(e).item.char === 'ウォ')
          expect(e.options).not.toContain(e.kind === 'kana-to-romaji' ? 'o' : 'ヲ');
      }
    }
  });

  it('avoids listening exercises without a Japanese voice', () => {
    const plan = buildLessonPlan(input({ speech: false }));
    expect(exercisesOf(plan).some((e) => e.kind === 'audio-to-kana')).toBe(false);
  });

  it('never shows the same character twice in a row after the first round when avoidable', () => {
    const practice = buildLessonPlan(input()).steps.find((s) => s.kind === 'practice');
    if (practice?.kind !== 'practice') throw new Error('no practice');
    const rest = practice.exercises.slice(L1.length);
    for (let i = 1; i < rest.length; i++)
      expect(kana(rest[i]!).item.char).not.toBe(kana(rest[i - 1]!).item.char);
  });

  it('never builds a multiple choice with a single option', () => {
    const plan = buildLessonPlan(
      input({
        lesson: { n: 0, kind: 'review', title: 'R', newItem: { type: 'none' } },
        lessonItems: [],
        dueReviews: [H('あ', 'a')],
        dueTotal: 1,
      }),
    );
    for (const e of exercisesOf(plan)) {
      if (e.kind !== 'type-romaji') expect(e.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('caps large groups (items left out are seeded as cards by the player)', () => {
    const many = Array.from({ length: 33 }, (_, i) => H(`x${i}`, `r${i}`));
    const practice = buildLessonPlan(input({ lessonItems: many })).steps.find(
      (s) => s.kind === 'practice',
    );
    if (practice?.kind !== 'practice') throw new Error('no practice');
    expect(practice.exercises.length).toBe(PRACTICE_CAP);
  });

  it('ends with a short quiz from the new characters', () => {
    const summary = buildLessonPlan(input()).steps.at(-1);
    if (summary?.kind !== 'summary') throw new Error('no summary');
    expect(summary.quiz).toHaveLength(QUIZ_LENGTH);
    for (const q of summary.quiz) expect(L1.map((i) => i.char)).toContain(kana(q).item.char);
  });

  it('gives every exercise a unique id', () => {
    const ids = exercisesOf(buildLessonPlan(input({ dueReviews: VOWELS, dueTotal: 5 }))).map(
      (e) => e.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildLessonPlan: tests and review lessons', () => {
  it('a test lesson has no new step and a fixed number of questions', () => {
    const covered = [...L1, ...Array.from({ length: 30 }, (_, i) => H(`y${i}`, `s${i}`))];
    const plan = buildLessonPlan(
      input({
        lesson: { n: 7, kind: 'test', title: 'Test', newItem: { type: 'none' } },
        lessonItems: [],
        coveredItems: covered,
      }),
    );
    expect(plan.steps.map((s) => s.kind)).toEqual(['practice']);
    const test = plan.steps[0];
    if (test?.kind !== 'practice') throw new Error('no test');
    expect(test.mode).toBe('test');
    expect(test.exercises).toHaveLength(TEST_LENGTH);
  });

  it('a review lesson mixes both alphabets', () => {
    const covered = [...L1, K('ア', 'a'), K('イ', 'i'), K('ウ', 'u'), K('エ', 'e'), K('オ', 'o')];
    const plan = buildLessonPlan(
      input({
        lesson: { n: 16, kind: 'review', title: 'Mix', newItem: { type: 'none' } },
        lessonItems: [],
        coveredItems: covered,
      }),
    );
    const scripts = new Set(exercisesOf(plan).map((e) => kana(e).item.script));
    expect(scripts).toEqual(new Set(['hiragana', 'katakana']));
  });
});

describe('grading', () => {
  it('maps card ids both ways', () => {
    expect(charFromCardId(kanaCardId('あ'))).toBe('あ');
    expect(charFromCardId('vocab:neko')).toBeNull();
  });

  it('gives one grade per card: any miss is "again"', () => {
    const g = gradesFromResults([
      { cardId: 'a', correct: true },
      { cardId: 'a', correct: false },
      { cardId: 'b', correct: true },
      { cardId: 'b', correct: true },
    ]);
    expect(g.get('a')).toBe('again');
    expect(g.get('b')).toBe('good');
  });

  it('scores the share of correct answers', () => {
    expect(scoreOf([])).toBe(1);
    expect(
      scoreOf([
        { cardId: 'a', correct: true },
        { cardId: 'b', correct: false },
      ]),
    ).toBe(0.5);
  });
});

const W = (id: string, kana: string, pl: string[], lesson = 4): WordItem => ({
  id,
  kana,
  romaji: id,
  pl,
  pos: ['n'],
  lesson,
});

const WORDS = [
  W('inu', 'いぬ', ['pies']),
  W('neko', 'ねこ', ['kot']),
  W('sakana', 'さかな', ['ryba']),
  W('hashi-bridge', 'はし', ['most']),
  W('hashi-chopsticks', 'はし', ['pałeczki (do jedzenia)']),
];

describe('buildLessonPlan: words', () => {
  const withWords = (over: Partial<PlanInput> = {}) =>
    buildLessonPlan(input({ lessonWords: WORDS, ...over }));

  it('adds a "words" step after the new kana and practises them', () => {
    const plan = withWords();
    expect(plan.steps.map((s) => s.kind)).toEqual(['new', 'words', 'practice', 'summary']);
    const practice = plan.steps.find((s) => s.kind === 'practice');
    if (practice?.kind !== 'practice') throw new Error('no practice');
    const wordExercises = practice.exercises.filter((e) => !isKanaExercise(e));
    expect(wordExercises.length).toBeGreaterThan(0);
    expect(wordExercises.length).toBeLessThanOrEqual(WORD_PRACTICE_CAP);
    for (const w of WORDS) expect(wordExercises.map((e) => e.cardId)).toContain(`vocab:${w.id}`);
  });

  it('never offers a homograph or a synonym as a wrong answer', () => {
    for (let seed = 0; seed < 30; seed++) {
      const plan = withWords({
        seed,
        spareWords: [W('kawa', 'かわ', ['rzeka']), W('wanko', 'わんこ', ['Pies'])],
      });
      for (const e of exercisesOf(plan)) {
        if (!isWordExercise(e) || e.kind === 'type-word') continue;
        expect(e.options).toContain(e.answer);
        expect(new Set(e.options).size).toBe(e.options.length);
        if (e.word.kana === 'はし' && e.kind === 'word-to-meaning') {
          // Both はし words are correct for the kana alone: only one of them may be offered.
          expect(e.options.filter((o) => o === 'most' || o.startsWith('pałeczki'))).toHaveLength(1);
        }
        if (e.word.id === 'inu' && e.kind !== 'word-to-meaning')
          // わんこ also means "pies": it would be a second correct answer.
          expect(e.options).not.toContain('わんこ');
      }
    }
  });

  it('keeps words with a shared core meaning apart and accepts a typed synonym', () => {
    const chichi = W('chichi', 'ちち', ['ojciec (własny)', 'tata (własny)']);
    const otousan = W('otousan', 'おとうさん', ['tata', 'ojciec (czyjś, grzecznie)']);
    const isha = W('isha', 'いしゃ', ['lekarz, lekarka']);
    const sensei = W('sensei', 'せんせい', ['nauczyciel, nauczycielka', 'lekarz, lekarka']);
    let typedIsha = 0;
    for (let seed = 0; seed < 40; seed++) {
      const plan = buildLessonPlan(
        input({
          lessonItems: [],
          lessonWords: [chichi, isha],
          knownWords: [otousan, sensei, ...WORDS],
          seed,
        }),
      );
      for (const e of exercisesOf(plan)) {
        if (!isWordExercise(e)) continue;
        if (e.word.id === 'chichi' && e.kind !== 'type-word') {
          expect(e.options).not.toContain('おとうさん');
          expect(e.options).not.toContain('tata');
        }
        if (e.word.id === 'chichi' && e.kind === 'type-word')
          expect(e.alsoAccepted).toBeUndefined();
        if (e.word.id === 'isha' && e.kind === 'type-word') {
          typedIsha++;
          // The prompt shows "lekarz, lekarka", which is also a sense of せんせい.
          expect(e.alsoAccepted).toEqual([{ kana: 'せんせい', romaji: 'sensei' }]);
        }
      }
    }
    expect(typedIsha).toBeGreaterThan(0);
  });

  it('words-only lessons skip the kana steps; quizzes mix both when there are both', () => {
    const wordsOnly = withWords({ lessonItems: [] });
    expect(wordsOnly.steps.map((s) => s.kind)).toEqual(['words', 'practice', 'summary']);
    const summary = withWords().steps.at(-1);
    if (summary?.kind !== 'summary') throw new Error('no summary');
    expect(summary.quiz.filter((e) => isKanaExercise(e))).toHaveLength(QUIZ_LENGTH / 2);
    expect(summary.quiz.filter((e) => !isKanaExercise(e))).toHaveLength(QUIZ_LENGTH / 2);
  });

  it('reviews due words next to due kana', () => {
    const plan = buildLessonPlan(
      input({
        lesson: { n: 0, kind: 'review', title: 'R', newItem: { type: 'none' } },
        lessonItems: [],
        dueReviews: [H('あ', 'a'), H('い', 'i')],
        dueWords: WORDS.slice(0, 3),
        knownWords: WORDS,
        dueTotal: 5,
      }),
    );
    const review = plan.steps[0];
    if (review?.kind !== 'review') throw new Error('no review');
    expect(review.exercises.map((e) => e.cardId).sort()).toEqual(
      ['kana:あ', 'kana:い', 'vocab:inu', 'vocab:neko', 'vocab:sakana'].sort(),
    );
  });

  it('tests and review lessons cover words too', () => {
    const test = buildLessonPlan(
      input({
        lesson: { n: 7, kind: 'test', title: 'Test', newItem: { type: 'none' } },
        lessonItems: [],
        coveredItems: L1,
        coveredWords: WORDS,
      }),
    );
    const step = test.steps[0];
    if (step?.kind !== 'practice') throw new Error('no test');
    expect(step.exercises.some((e) => !isKanaExercise(e))).toBe(true);
    expect(step.exercises.some((e) => isKanaExercise(e))).toBe(true);
    expect(step.exercises.length).toBeLessThanOrEqual(TEST_LENGTH);
  });
});
