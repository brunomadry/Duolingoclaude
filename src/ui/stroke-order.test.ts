import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildStrokesFile,
  defaultChars,
  kanjiVgCode,
  kanjiVgUrl,
  parseCharsArg,
  parseKanjiVgSvg,
} from '../../scripts/fetch-kanjivg.ts';
import type { StrokesFile } from '../shared/content-schema.ts';
import {
  DEFAULT_BOX,
  labelPositions,
  parseViewBox,
  strokeCountPl,
  strokeGeometry,
  strokeOrderLabel,
  strokeTimings,
} from './stroke-geometry.ts';
import type { StrokeGeometry } from './stroke-geometry.ts';

const A_S1 = 'M31.01,33c0.88,0.88,2.75,1.82,5.25,1.75c8.62-0.25,20-2.12,29.5-4.25';
const A_S2 = 'M49.76,17.62c0.88,1,1.82,3.26,1.38,5.25c-3.75,16.75-6.25,38.13-5.13,53.63';
const A_S3 = 'M65.63,44.12c0.75,1.12,1.16,4.39,0.5,6.12';

/** A trimmed KanjiVG file for あ, with the strokes deliberately out of document order. */
const SVG_A = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="109" height="109" viewBox="0 0 109 109" xmlns:kvg="https://kanjivg.tagaini.net/">
<g id="kvg:StrokePaths_03042" style="fill:none;stroke:#000000;stroke-width:3;">
<g id="kvg:03042" kvg:element="あ">
	<path id="kvg:03042-s2" kvg:type="㇑" d="${A_S2}"/>
	<path id="kvg:03042-s1" d="${A_S1}"/>
	<path id="kvg:03042-s3" d="${A_S3}" />
	<path id="other" d="M0,0L1,1"/>
</g>
</g>
<g id="kvg:StrokeNumbers_03042" style="font-size:8;fill:#808080">
	<text transform="matrix(1 0 0 1 22.51 35)">1</text>
</g>
</svg>`;

describe('fetch-kanjivg helpers', () => {
  it('names files by the 5-digit lowercase hex code point', () => {
    expect(kanjiVgCode('あ')).toBe('03042');
    expect(kanjiVgCode('ー')).toBe('030fc');
    expect(kanjiVgCode('日')).toBe('065e5');
    expect(kanjiVgUrl('あ')).toBe(
      'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/03042.svg',
    );
  });

  it('covers hiragana, katakana and the long vowel mark by default', () => {
    const chars = defaultChars();
    expect(chars).toHaveLength(86 + 90 + 1);
    expect(chars[0]).toBe('ぁ');
    expect(chars).toContain('ゖ');
    expect(chars).toContain('ア');
    expect(chars).toContain('ヺ');
    expect(chars.at(-1)).toBe('ー');
    expect(chars).not.toContain('・');
  });

  it('parses --chars: unique, sorted, whitespace ignored, non-BMP rejected', () => {
    expect(parseCharsArg('本 日日\n語𠮟')).toEqual({ chars: ['日', '本', '語'], rejected: ['𠮟'] });
  });

  it('extracts stroke paths ordered by their sN number', () => {
    expect(parseKanjiVgSvg(SVG_A, 'あ')).toEqual({
      viewBox: '0 0 109 109',
      strokes: [A_S1, A_S2, A_S3],
    });
  });

  it('rejects gaps in stroke numbers, missing strokes and a missing viewBox', () => {
    expect(() => parseKanjiVgSvg(SVG_A.replace('-s2"', '-s4"'), 'あ')).toThrow(/not 1\.\.n/);
    expect(() => parseKanjiVgSvg(SVG_A, 'い')).toThrow(/no stroke paths/);
    expect(() => parseKanjiVgSvg(SVG_A.replace('viewBox=', 'data-x='), 'あ')).toThrow(/viewBox/);
  });

  it('builds the file with keys sorted by code point', () => {
    const file = buildStrokesFile(
      '0 0 109 109',
      new Map([
        ['ア', ['M1,1']],
        ['ー', ['M2,2']],
        ['あ', ['M3,3']],
      ]),
    );
    expect(Object.keys(file.chars)).toEqual(['あ', 'ア', 'ー']);
    expect(file).toMatchObject({ version: 1, source: 'kanjivg', viewBox: '0 0 109 109' });
  });
});

describe('strokeGeometry', () => {
  it('reads start, direction and length of straight segments', () => {
    const g = strokeGeometry('M10,10 L50,10')!;
    expect(g.start).toEqual({ x: 10, y: 10 });
    expect(g.direction).toEqual({ x: 1, y: 0 });
    expect(g.length).toBeCloseTo(40);
    expect(strokeGeometry('M0 0h10v10z')!.length).toBeCloseTo(10 + 10 + Math.SQRT2 * 10);
  });

  it('handles relative cubics, smooth curves and implicit repeats', () => {
    // A straight cubic: the estimate equals the true length.
    const straight = strokeGeometry('M0,0c10,0,20,0,30,0')!;
    expect(straight.length).toBeCloseTo(30);
    // "s" reflects the previous control point; two repeated "c" sets continue from the end.
    expect(strokeGeometry('M0,0c0,0,10,0,10,0s10,0,10,0')!.length).toBeCloseTo(20);
    expect(strokeGeometry('m5,5c0,10,0,10,0,10,0,10,0,10,0,10')!.start).toEqual({ x: 5, y: 5 });
    expect(strokeGeometry('m5,5c0,10,0,10,0,10,0,10,0,10,0,10')!.length).toBeCloseTo(20);
  });

  it('skips zero-length control points when finding the direction', () => {
    const g = strokeGeometry('M10,10c0,0,0,5,0,10')!;
    expect(g.direction.x).toBeCloseTo(0);
    expect(g.direction.y).toBeCloseTo(1);
  });

  it('roughly matches the true length of a real KanjiVG stroke', () => {
    // 35.52 is the length of A_S1 measured by flattening both cubics into 2000 segments.
    const g = strokeGeometry(A_S1)!;
    expect(g.start).toEqual({ x: 31.01, y: 33 });
    expect(Math.abs(g.length - 35.52) / 35.52).toBeLessThan(0.02);
  });

  it('returns null for paths without a leading moveto', () => {
    expect(strokeGeometry('')).toBeNull();
    expect(strokeGeometry('L10,10')).toBeNull();
    expect(strokeGeometry('10,10')).toBeNull();
  });
});

describe('labels, timing and copy', () => {
  const stroke = (x: number, y: number, dx: number, dy: number): StrokeGeometry => ({
    start: { x, y },
    direction: { x: dx, y: dy },
    length: 50,
  });

  it('parses viewBoxes and falls back to the KanjiVG box', () => {
    expect(parseViewBox('0 0 109 109')).toEqual(DEFAULT_BOX);
    expect(parseViewBox('-5,-5 20 30')).toEqual({ x: -5, y: -5, width: 20, height: 30 });
    expect(parseViewBox('0 0 0 10')).toEqual(DEFAULT_BOX);
    expect(parseViewBox('nonsense')).toEqual(DEFAULT_BOX);
  });

  it('puts numbers just before where the stroke starts', () => {
    const [down, right] = labelPositions([stroke(50, 30, 0, 1), stroke(30, 60, 1, 0)]);
    expect(down!.x).toBeCloseTo(50);
    expect(down!.y).toBeCloseTo(23);
    expect(right!.x).toBeCloseTo(23);
    expect(right!.y).toBeCloseTo(60);
  });

  it('moves a number that would sit on an earlier one, and keeps numbers inside the box', () => {
    const [a, b] = labelPositions([stroke(50, 50, 1, 0), stroke(50, 50, 1, 0)]);
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThanOrEqual(7);
    const [edge] = labelPositions([stroke(2, 2, 1, 1)]);
    expect(edge).toEqual({ x: 5, y: 5 });
  });

  it('times longer strokes longer and plays them one after another', () => {
    const t = strokeTimings([1, 50, 1000], { leadMs: 100, gapMs: 10 });
    expect(t.map((s) => s.durationMs)).toEqual([300, 450, 1200]);
    expect(t.map((s) => s.delayMs)).toEqual([100, 410, 870]);
  });

  it('uses Polish plural forms for the stroke count', () => {
    const forms = [1, 2, 4, 5, 11, 12, 14, 21, 22, 25].map(strokeCountPl);
    expect(forms).toEqual([
      '1 kreska',
      '2 kreski',
      '4 kreski',
      '5 kresek',
      '11 kresek',
      '12 kresek',
      '14 kresek',
      '21 kresek',
      '22 kreski',
      '25 kresek',
    ]);
    expect(strokeOrderLabel('あ', 3)).toBe('Kolejność kresek znaku あ: 3 kreski');
  });
});

describe('content/strokes.json', () => {
  const file = JSON.parse(
    readFileSync(new URL('../../content/strokes.json', import.meta.url), 'utf8'),
  ) as StrokesFile;
  const box = parseViewBox(file.viewBox);

  it('has every default kana, keyed in code point order', () => {
    const keys = Object.keys(file.chars);
    for (const ch of defaultChars()) expect(keys).toContain(ch);
    const sorted = [...keys].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
    expect(keys).toEqual(sorted);
    expect(file.viewBox).toBe('0 0 109 109');
  });

  it('has the usual stroke counts for a few well-known kana', () => {
    const counts = { あ: 3, い: 2, き: 4, ふ: 4, を: 3, ア: 2, ン: 2, ガ: 4, ー: 1 };
    for (const [ch, n] of Object.entries(counts)) {
      expect(file.chars[ch]?.strokes, ch).toHaveLength(n);
    }
  });

  it('gives every stroke a start point inside the box and a positive length', () => {
    for (const [ch, { strokes }] of Object.entries(file.chars)) {
      for (const d of strokes) {
        const g = strokeGeometry(d);
        expect(g, `${ch}: ${d}`).not.toBeNull();
        expect(g!.length, ch).toBeGreaterThan(0);
        expect(g!.start.x, ch).toBeGreaterThanOrEqual(box.x);
        expect(g!.start.x, ch).toBeLessThanOrEqual(box.x + box.width);
        expect(g!.start.y, ch).toBeGreaterThanOrEqual(box.y);
        expect(g!.start.y, ch).toBeLessThanOrEqual(box.y + box.height);
      }
    }
  });
});
