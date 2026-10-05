import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildKanjiIndex,
  furigana,
  kanjiCardId,
  kanjiFromCardId,
  kanjiKnown,
  kanjiUpTo,
  readingLabel,
  readingsOf,
  type RawKanji,
  type RawKanjiCurriculum,
  type RawKanjiGlosses,
} from './kanji.ts';

const read = <T>(f: string): T =>
  JSON.parse(readFileSync(new URL(`../../content/${f}`, import.meta.url), 'utf8')) as T;

describe('furigana', () => {
  it('aligns readings with okurigana and inner kana', () => {
    expect(furigana('食べる', 'たべる')).toEqual([{ text: '食', rt: 'た' }, { text: 'べる' }]);
    expect(furigana('男の子', 'おとこのこ')).toEqual([
      { text: '男', rt: 'おとこ' },
      { text: 'の' },
      { text: '子', rt: 'こ' },
    ]);
    expect(furigana('お茶', 'おちゃ')).toEqual([{ text: 'お' }, { text: '茶', rt: 'ちゃ' }]);
    expect(furigana('学生', 'がくせい')).toEqual([{ text: '学生', rt: 'がくせい' }]);
    expect(furigana('ポーランド人', 'ポーランドじん')).toEqual([
      { text: 'ポーランド' },
      { text: '人', rt: 'じん' },
    ]);
  });

  it('falls back to the whole reading and leaves kana alone', () => {
    expect(furigana('いぬ', 'いぬ')).toEqual([{ text: 'いぬ' }]);
    expect(furigana('一日', 'ついたち')).toEqual([{ text: '一日', rt: 'ついたち' }]);
  });
});

describe('readings and known kanji', () => {
  it('formats KANJIDIC readings', () => {
    expect(readingLabel('た.べる')).toBe('た(べる)');
    expect(readingLabel('-び')).toBe('び');
    expect(readingLabel('ひと-')).toBe('ひと');
    expect(readingsOf({ on: ['ニチ', 'ジツ'], kun: ['ひ', '-び', '-か', 'ひ'] })).toEqual({
      on: ['ニチ', 'ジツ'],
      kun: ['ひ', 'び', 'か'],
    });
  });

  it('shows kanji only when all of them are known', () => {
    const known = new Set(['食', '人']);
    expect(kanjiKnown('食べる', known)).toBe(true);
    expect(kanjiKnown('日本人', known)).toBe(false);
    expect(kanjiKnown('いぬ', known)).toBe(true);
  });

  it('builds the index from the real curriculum', () => {
    const index = buildKanjiIndex(
      read<RawKanji>('kanji.json'),
      read<RawKanjiGlosses>('kanji.pl.json'),
      read<RawKanjiCurriculum>('curriculum.json'),
    );
    expect(index.items.length).toBeGreaterThanOrEqual(80);
    expect(new Set(index.items.map((k) => k.char)).size).toBe(index.items.length);
    expect(kanjiUpTo(index, 60).size).toBe(0);
    expect(kanjiUpTo(index, 100).size).toBe(index.items.length);
    expect(index.byChar.get('水')?.pl).toContain('woda');
    expect(kanjiFromCardId(kanjiCardId('水'))).toBe('水');
  });
});
