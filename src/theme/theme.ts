/**
 * Theme switching. The active profile's theme is mirrored to localStorage so the
 * inline script in index.html can set `data-theme` before first paint (no flash).
 */
export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'aka.theme';
/** Browser chrome colour per theme (matches --bg in tokens.css). */
export const THEME_COLORS: Record<Theme, string> = { dark: '#0f0d0e', light: '#f6f1e9' };

export function normalizeTheme(value: unknown): Theme {
  return value === 'light' ? 'light' : 'dark';
}

interface ThemeTarget {
  documentElement: { dataset: DOMStringMap };
  querySelector(selector: string): { setAttribute(name: string, value: string): void } | null;
}

export function applyTheme(
  theme: Theme,
  doc: ThemeTarget = document,
  storage: Pick<Storage, 'setItem'> | null = safeLocalStorage(),
): void {
  doc.documentElement.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or storage disabled: the theme still applies for this session.
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
