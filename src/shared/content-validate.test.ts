import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateContent, type RawContent } from './content-validate.ts';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../content/${name}`, import.meta.url), 'utf8'));

type LessonJson = {
  n: number;
  kind: string;
  words: string[];
  covers?: number[];
  [k: string]: unknown;
};
type CurriculumJson = { version: 1; lessons: LessonJson[] };

function base(): RawContent & { curriculum: CurriculumJson } {
  return {
    curriculum: structuredClone(read('curriculum.json')) as CurriculumJson,
    sources: read('SOURCES.json'),
  };
}

describe('real content files', () => {
  it('curriculum.json and SOURCES.json pass validation', () => {
    const report = validateContent({
      curriculum: read('curriculum.json'),
      sources: read('SOURCES.json'),
    });
    expect(report.errors).toEqual([]);
  });

  it('curriculum has 100 lessons with a test every 7th', () => {
    const c = read('curriculum.json') as CurriculumJson;
    expect(c.lessons).toHaveLength(100);
    expect(c.lessons.filter((l) => l.kind === 'test').map((l) => l.n)).toEqual([
      7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91, 98,
    ]);
  });
});

describe('curriculum schema and structure', () => {
  it('rejects a wrong lesson count', () => {
    const raw = base();
    raw.curriculum.lessons.pop();
    expect(validateContent(raw).errors.join('\n')).toMatch(/lessons/);
  });

  it('rejects unknown fields (strict schema)', () => {
    const raw = base();
    raw.curriculum.lessons[0]!.xp = 10;
    expect(validateContent(raw).errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-test lesson on a multiple of 7', () => {
    const raw = base();
    const l = raw.curriculum.lessons[6]!;
    l.kind = 'review';
    delete l.covers;
    expect(validateContent(raw).errors.join('\n')).toMatch(/every 7th lesson must be a test/);
  });

  it('rejects a kana lesson after lesson 16', () => {
    const raw = base();
    const l = raw.curriculum.lessons[19]!;
    l.kind = 'kana';
    l.newItem = { type: 'kana', script: 'hiragana', groups: ['h-a'] };
    expect(validateContent(raw).errors.join('\n')).toMatch(/kana lessons belong to L1-L16/);
  });
});

describe('cross references', () => {
  const vocab = {
    version: 1,
    words: [
      { id: 'neko', kana: 'ねこ', romaji: 'neko', en: ['cat'], pos: ['n'] },
      { id: 'inu', kana: 'いぬ', romaji: 'inu', en: ['dog'], pos: ['n'] },
    ],
  };
  const glosses = {
    version: 1,
    glosses: { neko: { pl: ['kot'], reviewed: false }, inu: { pl: ['pies'], reviewed: false } },
  };
  const example = (wordId: string, lesson: number, ja: string) => ({
    wordId,
    lesson,
    ja,
    pl: 'Zdanie.',
    source: 'original',
    reviewed: false,
  });

  function withWords(neko: number, inu: number, examples?: unknown[]) {
    const raw = base();
    // Only the two fixture words are taught (independent of the real word assignment).
    for (const l of raw.curriculum.lessons) l.words = [];
    raw.curriculum.lessons[neko - 1]!.words = ['neko'];
    raw.curriculum.lessons[inu - 1]!.words = ['inu'];
    return {
      ...raw,
      vocab,
      glosses,
      ...(examples ? { examples: { version: 1, examples } } : {}),
    };
  }

  it('needs no example sentences for words of the writing phase', () => {
    expect(validateContent(withWords(4, 5, [])).errors).toEqual([]);
  });

  it('accepts examples that only use taught words and grammar', () => {
    const raw = withWords(18, 20, [
      example('neko', 18, 'ねこです。'),
      example('inu', 20, 'いぬです。'),
    ]);
    expect(validateContent(raw).errors).toEqual([]);
  });

  it('requires an example for every word after the writing phase', () => {
    const errors = validateContent(withWords(18, 20, [example('neko', 18, 'ねこです。')])).errors;
    expect(errors.join('\n')).toMatch(/"inu" \(lesson 20\) has no example sentence/);
  });

  it('flags words taught later and grammar not taught yet', () => {
    const errors = validateContent(
      withWords(20, 18, [
        example('neko', 20, 'ねこです。'),
        example('inu', 18, 'いぬとねこです。'),
      ]),
    ).errors.join('\n');
    expect(errors).toMatch(/word "ねこ" taught in lesson 20/);
    expect(errors).toMatch(/grammar "と" \(to\) taught in lesson 26/);
  });

  it('flags an example that does not use its word', () => {
    const raw = withWords(18, 20, [
      example('neko', 18, 'ねこです。'),
      example('inu', 20, 'ねこです。'),
    ]);
    expect(validateContent(raw).errors.join('\n')).toMatch(/does not use the word/);
  });

  it('flags a missing word and a missing gloss', () => {
    const raw = withWords(4, 5, []);
    raw.curriculum.lessons[7]!.words = ['sakana'];
    const g = structuredClone(glosses) as { version: 1; glosses: Record<string, unknown> };
    delete g.glosses.inu;
    const errors = validateContent({ ...raw, glosses: g }).errors.join('\n');
    expect(errors).toMatch(/missing word "sakana"/);
    expect(errors).toMatch(/"inu" \(lesson 5\) has no Polish gloss/);
  });

  it('flags a word introduced twice', () => {
    const raw = withWords(4, 5, []);
    raw.curriculum.lessons[8]!.words = ['neko'];
    expect(validateContent(raw).errors.join('\n')).toMatch(/introduced twice/);
  });
});
