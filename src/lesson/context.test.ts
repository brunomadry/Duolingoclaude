import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLexicon, tokenize } from '../shared/jp-words.ts';
import type { CardRecord } from '../shared/api.ts';
import { isKanjiExercise, isSentenceExercise, isWordExercise, type LessonPlan } from './engine.ts';
import { buildKanjiIndex, type RawKanji, type RawKanjiGlosses } from './kanji.ts';
import { buildGrammarIndex, type RawExampleSentences, type RawGrammar } from './grammar.ts';
import {
  curriculum,
  dueReviews,
  dueSentenceReviews,
  focusGrammarOf,
  gates,
  particlesUpTo,
  planLesson,
  reviewableByCurriculum,
  reviewableCard,
  wordsOfGrammar,
} from './context.ts';
import { grammarCardId } from './sentence-exercises.ts';
import { buildVocabIndex, vocabCardId, type RawVocab } from './vocab.ts';

const read = <T>(f: string): T =>
  JSON.parse(readFileSync(new URL(`../../content/${f}`, import.meta.url), 'utf8')) as T;

const rawVocab = read<RawVocab>('vocab.json');
const vocab = buildVocabIndex(rawVocab, read('glosses.pl.json'), curriculum);
const lexicon = createLexicon(rawVocab.words.map((w) => ({ ...w, pos: w.pos ?? [] })));
const tools = {
  tokenize: (t: string) => tokenize(t, lexicon),
  isVerb: (id: string) => (vocab.byId.get(id)?.pos ?? []).some((p) => /^v[15ksz]/.test(p)),
  word: (id: string) => vocab.byId.get(id),
};

// Fixture content built from the real word assignment: "<word>です。" for nouns of L17-L20.
const nouns = (n: number) =>
  (vocab.byLesson.get(n) ?? []).filter((w) => w.pos.includes('n') || w.pos.includes('pn'));
const examples: RawExampleSentences = {
  examples: [17, 18, 19, 20].flatMap((n) =>
    nouns(n).map((w) => ({
      wordId: w.id,
      lesson: n,
      ja: `${w.kanji ?? w.kana}です。`,
      kana: `${w.kana}です。`,
      pl: `To ${w.pl[0] ?? ''}.`,
    })),
  ),
};
const grammarFile: RawGrammar = {
  notes: [
    {
      id: 'wa-desu',
      title: 'X は Y です',
      pattern: 'X は Y です',
      note: 'Notka.',
      typicalMistake: 'Błąd.',
      reviewed: false,
      examples: [
        { ja: '私は学生です。', kana: 'わたしは がくせいです。', pl: 'Jestem studentem.' },
        { ja: '私は先生です。', kana: 'わたしは せんせいです。', pl: 'Jestem nauczycielem.' },
        {
          ja: '私はポーランド人です。',
          kana: 'わたしは ポーランドじんです。',
          pl: 'Jestem Polakiem.',
        },
      ],
    },
  ],
};
const grammar = buildGrammarIndex((id) => gates.lessonOfGrammar(id), tools, grammarFile, examples);

const NOW = Date.UTC(2026, 9, 4, 10);
const ctx = (cards: CardRecord[] = []) => ({
  lessons: [],
  cards: new Map(cards.map((c) => [c.cardId, c])),
  now: NOW,
  speech: true,
});
const lesson = (n: number) => {
  const l = curriculum.lessons[n - 1];
  if (!l) throw new Error(`no lesson ${n}`);
  return l;
};
const kinds = (plan: LessonPlan) => plan.steps.map((s) => s.kind);
const practice = (plan: LessonPlan) => {
  const step = plan.steps.find((s) => s.kind === 'practice');
  if (step?.kind !== 'practice') throw new Error('no practice');
  return step.exercises;
};

describe('grammar lessons', () => {
  it('a grammar lesson shows its note, its words, then practises words and sentences', () => {
    const plan = planLesson(lesson(17), ctx(), vocab, grammar);
    expect(kinds(plan)).toEqual(['grammar', 'words', 'practice', 'chat', 'summary']);
    const exercises = practice(plan);
    expect(exercises.some(isWordExercise)).toBe(true);
    const sentences = exercises.filter(isSentenceExercise);
    expect(sentences.length).toBeGreaterThan(0);
    // Every sentence is readable at L17 and trains the lesson's grammar card.
    for (const e of sentences) {
      expect(e.sentence.lesson).toBeLessThanOrEqual(17);
      expect(e.cardId).toBe(grammarCardId('wa-desu'));
    }
  });

  it('a practice lesson works on the previous grammar point without a note', () => {
    const plan = planLesson(lesson(18), ctx(), vocab, grammar);
    expect(kinds(plan)).toEqual(['words', 'practice', 'chat', 'summary']);
    expect(practice(plan).filter(isSentenceExercise).length).toBeGreaterThan(0);
    expect(focusGrammarOf(18)).toEqual({ id: 'wa-desu', lesson: 17 });
  });

  it('a test after the writing phase checks words and sentences of the covered lessons', () => {
    const test = planLesson(lesson(21), ctx(), vocab, grammar);
    expect(kinds(test)).toEqual(['practice']);
    const exercises = practice(test);
    expect(exercises.some(isWordExercise)).toBe(true);
    expect(exercises.some(isSentenceExercise)).toBe(true);
    expect(exercises.length).toBeLessThanOrEqual(20);
  });

  it('reviews due grammar cards with a sentence the learner can read', () => {
    const card: CardRecord = {
      profileId: 'p',
      cardId: grammarCardId('wa-desu'),
      data: { algo: 'fsrs', due: NOW - 1000 } as unknown as CardRecord['data'],
      updatedAt: NOW,
      deleted: false,
    };
    const due = dueReviews(ctx([card]).cards, NOW);
    expect(due.grammarIds).toEqual(['wa-desu']);
    expect(dueReviews(ctx([card]).cards, NOW, { filter: 'words' }).grammarIds).toEqual([]);
    const reviews = dueSentenceReviews(due.grammarIds, grammar, 20, 'seed');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.sentence.lesson).toBeLessThanOrEqual(20);
  });
});

describe('the review step', () => {
  const dueCard = (cardId: string): CardRecord => ({
    profileId: 'p',
    cardId,
    data: { algo: 'fsrs', due: NOW - 1000 } as unknown as CardRecord['data'],
    updatedAt: NOW,
    deleted: false,
  });
  const reviewStep = (plan: LessonPlan) => {
    const step = plan.steps.find((s) => s.kind === 'review');
    if (step?.kind !== 'review') throw new Error('no review');
    return step.exercises;
  };

  it('counts a grammar card only once a sentence the learner can read uses it', () => {
    // Read the L17 note, left the lesson: nothing up to L16 can review it yet.
    expect(reviewableCard(vocab, grammar, undefined, 16)(grammarCardId('wa-desu'))).toBe(false);
    expect(reviewableCard(vocab, grammar, undefined, 17)(grammarCardId('wa-desu'))).toBe(true);
  });

  it('leaves out cards no exercise can clear before the queue is capped', () => {
    const stale = Array.from({ length: 25 }, (_, i) => dueCard(vocabCardId(`gone-${i}`)));
    const cards = ctx([...stale, dueCard(vocabCardId('gakusei')), dueCard('kanji:日')]).cards;
    const due = dueReviews(cards, NOW, {
      reviewable: reviewableCard(vocab, grammar, undefined, 20),
    });
    expect(due.wordIds).toEqual(['gakusei']);
    // Without the kanji data a kanji card cannot be reviewed either.
    expect(due.kanjiChars).toEqual([]);
    expect(due.dueTotal).toBe(1);
  });

  it('counts due cards from the curriculum alone on screens without the course content', () => {
    const reviewable = reviewableByCurriculum(20);
    expect(reviewable('kana:あ')).toBe(true);
    expect(reviewable(vocabCardId('gakusei'))).toBe(true);
    expect(reviewable(vocabCardId('gone-word'))).toBe(false);
    expect(reviewable(grammarCardId('wa-desu'))).toBe(true);
    // Its lesson (L29) is not completed: no card yet, and none to count.
    expect(reviewable(grammarCardId('masu-wo'))).toBe(false);
    expect(reviewable('kanji:日')).toBe(true);
    expect(reviewable('kanji:無')).toBe(false);
  });

  it('uses only what earlier lessons taught, before the lesson brings anything new', () => {
    const l17 = vocab.byLesson.get(17) ?? [];
    const plan = planLesson(
      lesson(19),
      ctx([dueCard(grammarCardId('wa-desu')), ...l17.map((w) => dueCard(vocabCardId(w.id)))]),
      vocab,
      grammar,
    );
    const exercises = reviewStep(plan);
    expect(exercises.some(isSentenceExercise)).toBe(true);
    // か is taught by L19 itself: no option or tile in its review.
    for (const e of exercises.filter(isSentenceExercise))
      expect([...e.options, ...(e.tiles ?? [])]).not.toContain('か');
    const fresh = new Set((vocab.byLesson.get(19) ?? []).map((w) => w.kana));
    for (const e of exercises.filter(isWordExercise))
      for (const o of e.options) expect(fresh.has(o)).toBe(false);
  });
});

describe('helpers', () => {
  it('knows the particles taught by a lesson', () => {
    expect(particlesUpTo(17)).toEqual(['wa']);
    expect(particlesUpTo(26)).toEqual(expect.arrayContaining(['wa', 'ka', 'no', 'mo', 'to', 'ya']));
    expect(particlesUpTo(26)).not.toContain('wo');
  });

  it('lists the words taught with a grammar point', () => {
    const words = wordsOfGrammar('wa-desu');
    for (const w of [
      ...(curriculum.lessons[16]?.words ?? []),
      ...(curriculum.lessons[17]?.words ?? []),
    ])
      expect(words.has(w)).toBe(true);
  });
});

describe('kanji, the final review and the final test', () => {
  const kanji = buildKanjiIndex(
    read<RawKanji>('kanji.json'),
    read<RawKanjiGlosses>('kanji.pl.json'),
    curriculum,
  );
  const firstKanjiLesson = kanji.items[0]?.lesson ?? 61;

  it('teaches a lesson kanji after its words, with meaning and reading exercises', () => {
    const plan = planLesson(lesson(firstKanjiLesson), ctx(), vocab, grammar, kanji);
    expect(kinds(plan)).toContain('kanji');
    const step = plan.steps.find((st) => st.kind === 'kanji');
    if (step?.kind !== 'kanji') throw new Error('no kanji step');
    expect(step.items.map((k) => k.lesson)).toEqual(step.items.map(() => firstKanjiLesson));
    const exercises = practice(plan).filter(isKanjiExercise);
    expect(exercises.map((e) => e.kind)).toContain('kanji-meaning');
    for (const e of exercises) {
      expect(e.options).toContain(e.answer);
      expect(new Set(e.options).size).toBe(e.options.length);
    }
  });

  it('a kanji lesson has its kanji as the new item', () => {
    const plan = planLesson(lesson(94), ctx(), vocab, grammar, kanji);
    expect(kinds(plan)).toContain('kanji');
  });

  it('the review lesson mixes words, sentences and kanji without kana drills', () => {
    const plan = planLesson(lesson(99), ctx(), vocab, grammar, kanji);
    const exercises = practice(plan);
    expect(exercises.some(isWordExercise)).toBe(true);
    expect(exercises.some(isKanjiExercise)).toBe(true);
    expect(exercises.some((e) => 'item' in e)).toBe(false);
  });

  it('the last lesson is a test over the whole course', () => {
    const plan = planLesson(lesson(100), ctx(), vocab, grammar, kanji);
    expect(kinds(plan)).toEqual(['practice']);
    const step = plan.steps[0];
    expect(step?.kind === 'practice' && step.mode).toBe('test');
  });
});
