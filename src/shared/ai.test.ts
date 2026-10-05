import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkAiSentence,
  exercisePrompt,
  parseJsonObject,
  politeOnly,
  readCorrection,
  readSentence,
  type AiLessonContext,
  type ValidatorDeps,
} from './ai.ts';
import { createGates } from './grammar-gates.ts';
import { createLexicon, type LexEntry } from './jp-words.ts';

const read = (f: string) =>
  JSON.parse(readFileSync(new URL(`../../content/${f}`, import.meta.url), 'utf8')) as unknown;
const curriculum = read('curriculum.json') as {
  lessons: { n: number; words: string[]; newItem: { type: string; grammarId?: string } }[];
};
const vocab = (read('vocab.json') as { words: LexEntry[] }).words;
const lessonOfWord = new Map<string, number>();
for (const l of curriculum.lessons) for (const w of l.words) lessonOfWord.set(w, l.n);
const deps: ValidatorDeps = {
  lexicon: createLexicon(vocab.map((w) => ({ ...w, pos: w.pos ?? [] }))),
  gates: createGates(curriculum),
  lessonOfWord,
  posOfWord: new Map(vocab.map((w) => [w.id, w.pos ?? []])),
};

describe('parsing model answers', () => {
  it('finds the JSON object inside code fences or text', () => {
    expect(parseJsonObject('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('Here you go: {"b": [2]} hope it helps')).toEqual({ b: [2] });
    expect(parseJsonObject('no json')).toBeNull();
    expect(parseJsonObject('{broken')).toBeNull();
  });

  it('accepts only well-formed sentences with a pure kana reading', () => {
    expect(
      readSentence({ ja: ' 私は 学生です。', kana: 'わたしは  がくせいです。', pl: ' Jestem. ' }),
    ).toEqual({ ja: '私は学生です。', kana: 'わたしは がくせいです。', pl: 'Jestem.' });
    expect(readSentence({ ja: '私は学生です。', kana: '私は がくせいです。', pl: 'x' })).toBeNull();
    expect(readSentence({ ja: '私は学生です。', kana: 'watashi wa', pl: 'x' })).toBeNull();
    expect(readSentence({ ja: '', kana: 'わ', pl: 'x' })).toBeNull();
    expect(readSentence('nope')).toBeNull();
  });
});

describe('validation', () => {
  it('passes taught material and names what is not taught', () => {
    const ok = checkAiSentence(
      { ja: '私は学生です。', kana: 'わたしは がくせいです。', pl: '' },
      17,
      deps,
    );
    expect(ok).toMatchObject({ ok: true, offending: [] });
    const bad = checkAiSentence(
      { ja: '私はパンを食べます。', kana: 'わたしは パンを たべます。', pl: '' },
      17,
      deps,
    );
    expect(bad.ok).toBe(false);
    expect(bad.readingOk).toBe(true);
    expect(bad.offending).toContain('たべます');
  });

  it('rejects a reading that does not spell the sentence', () => {
    for (const [ja, kana, n] of [
      ['本です。', 'ほんでした。', 22],
      ['本です。', 'たかい ほんです。', 22],
      ['水を飲みます。', 'みずを のみません。', 30],
      ['水を飲みます。', 'みずお のみます。', 30],
      ['私は学生です。', 'わたしわ がくせいです。', 17],
    ] as const) {
      const v = checkAiSentence({ ja, kana, pl: '' }, n, deps);
      expect(v, `${ja} / ${kana}`).toMatchObject({ ok: false, readingOk: false });
    }
  });

  it('keeps a correction only when it passes and names only taught grammar', () => {
    const answer = JSON.stringify({
      ok: false,
      corrected: { ja: '私は学生です。', kana: 'わたしは がくせいです。', pl: 'Jestem studentem.' },
      grammarIds: ['wa-desu', 'te-form', 'wa-desu'],
    });
    expect(readCorrection(answer, 17, deps, ['wa-desu'])).toEqual({
      ok: false,
      corrected: { ja: '私は学生です。', kana: 'わたしは がくせいです。', pl: 'Jestem studentem.' },
      grammarIds: ['wa-desu'],
    });
    expect(readCorrection('{"ok": true}', 17, deps, [])).toEqual({ ok: true, grammarIds: [] });
    expect(readCorrection('garbage', 17, deps, [])).toBeNull();
  });
});

describe('prompts', () => {
  const ctx: AiLessonContext = {
    lessonN: 17,
    words: [{ written: '学生', kana: 'がくせい', en: 'student' }],
    newWords: [{ written: '学生', kana: 'がくせい', en: 'student' }],
    grammar: ['wa-desu'],
    focus: 'wa-desu',
  };

  it('carry the whitelist and the politeness rule', () => {
    const p = exercisePrompt(ctx, 5);
    expect(p.system).toContain('学生(がくせい)=student');
    expect(p.system).toContain('Polite です/ます style only');
    expect(p.user).toContain('5 different sentences');
    expect(politeOnly(60)).toBe(true);
    expect(politeOnly(61)).toBe(false);
  });
});
