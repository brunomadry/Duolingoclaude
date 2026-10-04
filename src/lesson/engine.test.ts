import { describe, expect, it } from 'vitest';
import {
  PRACTICE_CAP,
  QUIZ_LENGTH,
  TEST_LENGTH,
  buildLessonPlan,
  charFromCardId,
  gradesFromResults,
  kanaCardId,
  scoreOf,
  type Exercise,
  type KanaItem,
  type PlanInput,
} from './engine.ts';

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
    expect(practice.exercises.slice(0, L1.length).map((e) => e.item.char)).toEqual(
      L1.map((i) => i.char),
    );
    expect(new Set(practice.exercises.map((e) => e.item.char))).toEqual(
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
      if (e.item.char === 'じ' && e.kind !== 'kana-to-romaji')
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
        if (e.item.char === 'ヲ')
          expect(e.options).not.toContain(e.kind === 'kana-to-romaji' ? 'wo' : 'ウォ');
        if (e.item.char === 'ウォ')
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
      expect(rest[i]!.item.char).not.toBe(rest[i - 1]!.item.char);
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
    for (const q of summary.quiz) expect(L1.map((i) => i.char)).toContain(q.item.char);
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
    const scripts = new Set(exercisesOf(plan).map((e) => e.item.script));
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
