import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRAMMAR_WORDS, createLexicon, tokenize, type LexEntry } from './jp-words.ts';
import {
  FORM_GATES,
  GRAMMAR_KEY_GATES,
  checkTokens,
  createGates,
  readingProblems,
  type CheckContext,
} from './grammar-gates.ts';

const read = (f: string) =>
  JSON.parse(readFileSync(new URL(`../../content/${f}`, import.meta.url), 'utf8'));
const curriculum = read('curriculum.json') as {
  lessons: { n: number; newItem: { type: string; grammarId?: string } }[];
};
const vocab = read('vocab.json').words as (LexEntry & { id: string })[];
const gates = createGates(curriculum);
const lexicon = createLexicon(vocab);

function ctx(lessonN: number, taught: Record<string, number>): CheckContext {
  return {
    lessonN,
    gates,
    lessonOfWord: new Map(Object.entries(taught)),
    posOfWord: new Map(vocab.map((w) => [w.id, w.pos])),
  };
}

const check = (text: string, lessonN: number, taught: Record<string, number>) =>
  checkTokens(tokenize(text, lexicon), ctx(lessonN, taught));

describe('gate tables', () => {
  it('maps every GRAMMAR_WORDS key', () => {
    const keys = (Array.isArray(GRAMMAR_WORDS) ? GRAMMAR_WORDS : Object.values(GRAMMAR_WORDS)) as {
      key: string;
    }[];
    const missing = keys.map((g) => g.key).filter((k) => !(k in GRAMMAR_KEY_GATES));
    expect(missing).toEqual([]);
  });

  it('only points at grammar ids that exist in the curriculum', () => {
    const ids = new Set(
      curriculum.lessons.flatMap((l) => (l.newItem.grammarId ? [l.newItem.grammarId] : [])),
    );
    for (const id of [...Object.values(GRAMMAR_KEY_GATES), ...Object.values(FORM_GATES)]) {
      if (id !== null) expect(ids.has(id), id).toBe(true);
    }
  });

  it('opens grammar in curriculum order', () => {
    expect(gates.keyLesson('wa')).toBe(17);
    expect(gates.keyLesson('wo')).toBe(29);
    expect(gates.formLesson('te')).toBe(50);
    expect(gates.formLesson('dict')).toBe(64);
    expect(gates.formLesson('tara')).toBeNull();
    expect(gates.keyLesson('not-a-key')).toBeNull();
  });
});

describe('checkTokens', () => {
  const words = {
    watashi: 17,
    gakusei: 17,
    pan: 30,
    taberu: 30,
    yomu: 30,
    hon: 30,
    neru: 30,
    takai: 38,
  };

  it('accepts a sentence once its words and grammar are taught', () => {
    expect(check('わたしは学生です。', 17, words).ok).toBe(true);
    expect(check('わたしは学生です。', 16, words).problems.join()).toMatch(/taught in lesson 17/);
  });

  it('gates objects and polite verbs at the masu lesson', () => {
    expect(check('パンを食べます。', 29, words).ok).toBe(false); // pan/taberu taught in 30
    expect(check('パンを食べます。', 30, words).ok).toBe(true);
  });

  it('gates plain dictionary forms and te-forms', () => {
    expect(check('パンを食べる。', 40, words).problems.join()).toMatch(
      /\(dict\) taught in lesson 64/,
    );
    expect(check('本を読んで、寝ます。', 49, words).problems.join()).toMatch(
      /\(te\) taught in lesson 50/,
    );
    expect(check('本を読んで、寝ます。', 50, words).ok).toBe(true);
  });

  it('rejects words never taught and N4 forms', () => {
    expect(check('わたしは学生です。', 30, { gakusei: 17 }).problems.join()).toMatch(
      /never taught/,
    );
    expect(check('パンを食べたら', 100, words).problems.join()).toMatch(/above N5/);
  });

  it('reports the used vocabulary ids', () => {
    expect(check('わたしは学生です。', 20, words).wordIds).toEqual(['watashi', 'gakusei']);
  });

  it('allows flagged surfaces such as names', () => {
    const tokens = tokenize('トムさんは学生です。', lexicon);
    expect(checkTokens(tokens, ctx(20, words)).ok).toBe(false);
    expect(checkTokens(tokens, { ...ctx(20, words), allowSurfaces: new Set(['トム']) }).ok).toBe(
      true,
    );
  });
});

describe('readingProblems', () => {
  const problems = (ja: string, kana: string, allow?: string[]) =>
    readingProblems(tokenize(ja, lexicon), tokenize(kana, lexicon), new Set(allow));

  it('accepts a reading that spells the same words', () => {
    expect(problems('私は学生です。', 'わたしは がくせいです。')).toEqual([]);
    expect(problems('３時に行きます。', 'さんじに いきます。')).toEqual([]);
    expect(problems('目が痛いです。', 'めが いたいです。')).toEqual([]);
  });

  it('reports a reading with other words or unknown text', () => {
    expect(problems('私は学生です。', 'わたしは せんせいです。')).toEqual([
      'reading does not spell "学生"',
    ]);
    expect(problems('マイクさんは学生です。', 'ジョンさんは がくせいです。', ['マイク'])).toEqual([
      'reading has unknown "ジョン"',
    ]);
    expect(problems('マイクさんは学生です。', 'マイクさんは がくせいです。', ['マイク'])).toEqual(
      [],
    );
  });
});
