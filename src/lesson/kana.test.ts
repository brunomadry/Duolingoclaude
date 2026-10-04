import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Curriculum, KanaFile } from '../shared/content-schema.ts';
import {
  acceptedRomaji,
  charsOf,
  chartRows,
  findKana,
  groupById,
  groupsForLesson,
  kanaGroups,
  yoonRows,
  type ChartRow,
} from './kana.ts';
import { isRomajiAnswerCorrect, kanaToRomaji } from './romaji.ts';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../content/${name}`, import.meta.url), 'utf8'));

const cells = (row: ChartRow | undefined): (string | null)[] =>
  (row ?? []).map((c) => c?.char ?? null);

const basicChars = (script: 'hiragana' | 'katakana') =>
  kanaGroups()
    .filter((g) => g.script === script && g.kind === 'basic')
    .flatMap((g) => g.chars);

describe('kana.json', () => {
  it('matches the KanaFile schema', () => {
    const result = KanaFile.safeParse(read('kana.json'));
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it('has 46 basic hiragana and 46 basic katakana, ん and ン included', () => {
    const hira = basicChars('hiragana').map((c) => c.char);
    const kata = basicChars('katakana').map((c) => c.char);
    expect(hira).toHaveLength(46);
    expect(kata).toHaveLength(46);
    expect(hira).toContain('ん');
    expect(kata).toContain('ン');
  });

  it('has no duplicate characters within a script and no duplicate group ids', () => {
    for (const script of ['hiragana', 'katakana'] as const) {
      const chars = kanaGroups()
        .filter((g) => g.script === script)
        .flatMap((g) => g.chars.map((c) => c.char));
      expect(new Set(chars).size).toBe(chars.length);
    }
    const ids = kanaGroups().map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains exactly the kana groups the curriculum references, in the right script', () => {
    const curriculum = Curriculum.parse(read('curriculum.json'));
    const referenced = new Set<string>();
    for (const lesson of curriculum.lessons) {
      if (lesson.newItem.type !== 'kana') continue;
      for (const id of lesson.newItem.groups) {
        referenced.add(id);
        const group = groupById(id);
        expect(group, `lesson ${lesson.n} group ${id}`).toBeDefined();
        if (lesson.newItem.script !== 'mixed') expect(group?.script).toBe(lesson.newItem.script);
      }
    }
    expect(
      kanaGroups()
        .map((g) => g.id)
        .sort(),
    ).toEqual([...referenced].sort());
  });

  it('gives every basic character an unreviewed Polish mnemonic', () => {
    for (const c of [...basicChars('hiragana'), ...basicChars('katakana')]) {
      expect(c.mnemonic?.pl.trim(), c.char).toBeTruthy();
      expect(c.mnemonic?.reviewed, c.char).toBe(false);
      expect(c.mnemonic?.pl, c.char).not.toMatch(/[—–]/);
    }
    for (const g of kanaGroups()) {
      if (g.note) expect(g.note.reviewed, g.id).toBe(false);
    }
  });

  it('sets chart columns for basic and dakuten kana only', () => {
    for (const g of kanaGroups()) {
      for (const c of g.chars) {
        const inGrid =
          (g.kind === 'basic' || g.kind === 'dakuten') && c.char !== 'ん' && c.char !== 'ン';
        expect(c.col !== undefined, `${g.id} ${c.char}`).toBe(inGrid);
      }
    }
  });

  it('uses only kana from its own script (no kanji look-alikes such as 力 for カ)', () => {
    for (const g of kanaGroups()) {
      const block = g.script === 'hiragana' ? /^[ぁ-ゟ]+$/u : /^[゠-ヿ]+$/u;
      for (const c of g.chars) expect(c.char, g.id).toMatch(block);
    }
  });

  it('has the full dakuten, handakuten and yoon tables', () => {
    const count = (id: string) => groupById(id)?.chars.length;
    for (const s of ['h', 'k']) {
      expect(count(`${s}-dakuten`)).toBe(20);
      expect(count(`${s}-handakuten`)).toBe(5);
      expect(count(`${s}-yoon`)).toBe(33);
    }
  });

  it('agrees with the romaji rules module on every answer and alternative', () => {
    for (const g of kanaGroups()) {
      for (const c of g.chars) {
        expect(kanaToRomaji(c.char), c.char).toBe(c.romaji);
        for (const typed of acceptedRomaji(c.char)) {
          expect(isRomajiAnswerCorrect(typed, c.char), `${c.char} ${typed}`).toBe(true);
        }
      }
    }
  });

  it('uses lowercase romaji with alternatives that differ from the answer', () => {
    for (const g of kanaGroups()) {
      for (const c of g.chars) {
        expect(c.romaji).toMatch(/^[a-z]+$/);
        expect(c.alt ?? []).not.toContain(c.romaji);
        expect(new Set(c.alt).size).toBe((c.alt ?? []).length);
      }
    }
  });
});

describe('Hepburn romaji', () => {
  it.each([
    ['あ', 'a'],
    ['し', 'shi'],
    ['ち', 'chi'],
    ['つ', 'tsu'],
    ['ふ', 'fu'],
    ['じ', 'ji'],
    ['ぢ', 'ji'],
    ['づ', 'zu'],
    ['を', 'o'],
    ['ん', 'n'],
    ['ぱ', 'pa'],
    ['きゃ', 'kya'],
    ['しゅ', 'shu'],
    ['ちょ', 'cho'],
    ['じゃ', 'ja'],
    ['っか', 'kka'],
    ['っち', 'tchi'],
    ['シ', 'shi'],
    ['ツ', 'tsu'],
    ['ヲ', 'o'],
    ['ン', 'n'],
    ['ヂ', 'ji'],
    ['カー', 'kaa'],
    ['ティ', 'ti'],
    ['ファ', 'fa'],
    ['ウォ', 'wo'],
    ['チェ', 'che'],
    ['ヴ', 'vu'],
  ])('%s is %s', (char, romaji) => {
    expect(findKana(char)?.romaji).toBe(romaji);
  });

  it('accepts common typing alternatives after the answer', () => {
    expect(acceptedRomaji('し')).toEqual(['shi', 'si']);
    expect(acceptedRomaji('つ')).toEqual(['tsu', 'tu']);
    expect(acceptedRomaji('ふ')).toEqual(['fu', 'hu']);
    expect(acceptedRomaji('ぢ')).toEqual(['ji', 'di']);
    expect(acceptedRomaji('づ')).toEqual(['zu', 'du']);
    expect(acceptedRomaji('を')).toEqual(['o', 'wo']);
    expect(acceptedRomaji('ん')).toEqual(['n', 'nn']);
    expect(acceptedRomaji('っち')).toContain('cchi');
    expect(acceptedRomaji('カー')).toEqual(['kaa', 'ka-']);
    expect(acceptedRomaji('か')).toEqual(['ka']);
    expect(acceptedRomaji('x')).toEqual([]);
  });
});

describe('lookup helpers', () => {
  it('finds a character with its group and mnemonic', () => {
    const k = findKana('ぬ');
    expect(k?.group.id).toBe('h-na');
    expect(k?.alt).toEqual([]);
    expect(k?.mnemonic?.pl).toBeTruthy();
    expect(findKana('キャ')?.group.id).toBe('k-yoon');
    expect(findKana('a')).toBeUndefined();
  });

  it('returns lesson groups in order and skips unknown ids', () => {
    expect(groupsForLesson(['h-ka', 'nope', 'h-a']).map((g) => g.id)).toEqual(['h-ka', 'h-a']);
    expect(groupById('nope')).toBeUndefined();
  });

  it('flattens the characters of several groups', () => {
    expect(charsOf(['h-a', 'h-ya']).map((c) => c.char)).toEqual([
      'あ',
      'い',
      'う',
      'え',
      'お',
      'や',
      'ゆ',
      'よ',
    ]);
  });
});

describe('chart layout', () => {
  it('lays out basic hiragana as 11 rows of 5 with gaps', () => {
    const rows = chartRows('hiragana');
    expect(rows).toHaveLength(11);
    for (const row of rows) expect(row).toHaveLength(5);
    expect(cells(rows[0])).toEqual(['あ', 'い', 'う', 'え', 'お']);
    expect(cells(rows[7])).toEqual(['や', null, 'ゆ', null, 'よ']);
    expect(cells(rows[9])).toEqual(['わ', null, null, null, 'を']);
    expect(cells(rows[10])).toEqual(['ん', null, null, null, null]);
    expect(rows[1]?.[0]?.groupId).toBe('h-ka');
  });

  it('lays out the katakana Y and W rows the same way', () => {
    const rows = chartRows('katakana', ['basic']);
    expect(rows).toHaveLength(11);
    expect(cells(rows[7])).toEqual(['ヤ', null, 'ユ', null, 'ヨ']);
    expect(cells(rows[9])).toEqual(['ワ', null, null, null, 'ヲ']);
    expect(cells(rows[10])).toEqual(['ン', null, null, null, null]);
  });

  it('splits dakuten and handakuten into full rows', () => {
    const rows = chartRows('hiragana', ['dakuten']);
    expect(rows.map((r) => r[0]?.char)).toEqual(['が', 'ざ', 'だ', 'ば', 'ぱ']);
    expect(cells(rows[2])).toEqual(['だ', 'ぢ', 'づ', 'で', 'ど']);
    expect(rows.flat().every((c) => c !== null)).toBe(true);
    expect(chartRows('katakana', ['basic', 'dakuten'])).toHaveLength(16);
  });

  it('lays out yoon as rows of ya, yu, yo', () => {
    for (const script of ['hiragana', 'katakana'] as const) {
      const rows = yoonRows(script);
      expect(rows).toHaveLength(11);
      for (const row of rows) {
        expect(row).toHaveLength(3);
        expect(row.every((c) => c !== null)).toBe(true);
      }
    }
    const hira = yoonRows('hiragana');
    expect(cells(hira[0])).toEqual(['きゃ', 'きゅ', 'きょ']);
    expect(cells(hira[8])).toEqual(['じゃ', 'じゅ', 'じょ']);
    expect(cells(yoonRows('katakana')[10])).toEqual(['ピャ', 'ピュ', 'ピョ']);
  });
});
