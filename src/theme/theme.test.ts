import { describe, expect, it } from 'vitest';
import { THEME_COLORS, THEME_STORAGE_KEY, applyTheme, normalizeTheme } from './theme.ts';

describe('theme', () => {
  it('defaults to dark for anything that is not "light"', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme(null)).toBe('dark');
    expect(normalizeTheme('neon')).toBe('dark');
  });

  it('sets data-theme, the theme-color meta and the no-flash cache', () => {
    const dataset: Record<string, string> = {};
    let metaColor = '';
    const stored = new Map<string, string>();
    applyTheme(
      'light',
      {
        documentElement: { dataset },
        querySelector: () => ({ setAttribute: (_n: string, v: string) => (metaColor = v) }),
      },
      { setItem: (k: string, v: string) => void stored.set(k, v) },
    );
    expect(dataset.theme).toBe('light');
    expect(metaColor).toBe(THEME_COLORS.light);
    expect(stored.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('survives a storage that throws', () => {
    const dataset: Record<string, string> = {};
    expect(() =>
      applyTheme(
        'dark',
        { documentElement: { dataset }, querySelector: () => null },
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
      ),
    ).not.toThrow();
    expect(dataset.theme).toBe('dark');
  });
});
