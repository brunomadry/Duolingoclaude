import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkThemes, contrastRatio, parseHex, parseThemes } from './contrast.ts';

describe('contrast math', () => {
  it('matches known WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('expands short hex', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(() => parseHex('red')).toThrow();
  });
});

describe('tokens.css', () => {
  const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  const themes = parseThemes(css);

  it('defines the brief palette for the dark theme', () => {
    expect(themes.dark['--bg']).toBe('#0f0d0e');
    expect(themes.dark['--accent']).toBe('#e4472b');
    expect(themes.light['--bg']).toBe('#f6f1e9');
    expect(themes.light['--accent']).toBe('#c8341b');
  });

  it('passes WCAG AA for every required pairing', () => {
    const failures = checkThemes(themes).filter((r) => !r.pass);
    expect(failures).toEqual([]);
  });
});
