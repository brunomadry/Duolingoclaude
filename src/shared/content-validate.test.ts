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
      { id: 'neko', kana: 'ねこ', romaji: 'neko', en: ['cat'], sentences: [1] },
      { id: 'inu', kana: 'いぬ', romaji: 'inu', en: ['dog'], sentences: [2] },
    ],
  };
  const glosses = {
    version: 1,
    glosses: { neko: { pl: ['kot'], reviewed: false }, inu: { pl: ['pies'], reviewed: false } },
  };
  const sentences = {
    version: 1,
    sentences: [
      {
        id: 1,
        ja: 'ねこです。',
        en: 'It is a cat.',
        pl: 'To kot.',
        words: ['neko'],
        source: 'original',
      },
      {
        id: 2,
        ja: 'いぬとねこ。',
        en: 'A dog and a cat.',
        pl: 'Pies i kot.',
        words: ['inu', 'neko'],
        source: 'original',
      },
    ],
  };

  function withWords(neko: number, inu: number): RawContent & { curriculum: CurriculumJson } {
    const raw = base();
    raw.curriculum.lessons[neko - 1]!.words = ['neko'];
    raw.curriculum.lessons[inu - 1]!.words = ['inu'];
    return { ...raw, vocab, glosses, sentences };
  }

  it('accepts sentences that only use already taught words', () => {
    expect(validateContent(withWords(4, 5)).errors).toEqual([]);
  });

  it('flags a sentence that uses a word taught in a later lesson', () => {
    const errors = validateContent(withWords(6, 5)).errors.join('\n');
    expect(errors).toMatch(/uses "neko" which is taught later \(lesson 6\)/);
  });

  it('honours flagged exceptions', () => {
    const raw = withWords(6, 5);
    const s = structuredClone(sentences);
    (s.sentences[1] as { allowUnknown?: string[] }).allowUnknown = ['neko'];
    expect(validateContent({ ...raw, sentences: s }).errors).toEqual([]);
  });

  it('flags a missing word, a missing gloss and a missing translation', () => {
    const raw = withWords(4, 5);
    raw.curriculum.lessons[7]!.words = ['sakana'];
    const g = structuredClone(glosses) as { version: 1; glosses: Record<string, unknown> };
    delete g.glosses.inu;
    const s = structuredClone(sentences) as { version: 1; sentences: { pl?: string }[] };
    delete s.sentences[0]!.pl;
    const errors = validateContent({ ...raw, glosses: g, sentences: s }).errors.join('\n');
    expect(errors).toMatch(/missing word "sakana"/);
    expect(errors).toMatch(/"inu" \(lesson 5\) has no Polish gloss/);
    expect(errors).toMatch(/sentence 1 \(lesson 4\) has no Polish translation/);
  });

  it('flags a word introduced twice', () => {
    const raw = withWords(4, 5);
    raw.curriculum.lessons[8]!.words = ['neko'];
    expect(validateContent(raw).errors.join('\n')).toMatch(/introduced twice/);
  });
});
