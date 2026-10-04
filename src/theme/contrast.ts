/**
 * WCAG 2.x contrast helpers and the list of colour pairings the UI relies on.
 * Pure functions so they can run in Node (scripts/check-contrast.ts) and in tests.
 */

export type ThemeName = 'dark' | 'light';
export type TokenMap = Record<string, string>;

export interface ContrastRequirement {
  fg: string;
  bg: string;
  min: number;
  kind: 'text' | 'non-text';
}

const SURFACES = ['--bg', '--surface', '--elevated'];
const TEXT_TOKENS = [
  '--text',
  '--text-muted',
  '--accent-text',
  '--success-text',
  '--error-text',
  '--gold',
];
const NON_TEXT_TOKENS = ['--accent', '--error', '--success', '--border-strong'];

/** Every pairing that must pass. AA: 4.5 for text, 3.0 for UI components and graphics. */
export const REQUIREMENTS: ContrastRequirement[] = [
  ...TEXT_TOKENS.flatMap((fg) =>
    SURFACES.map((bg) => ({ fg, bg, min: 4.5, kind: 'text' as const })),
  ),
  { fg: '--on-accent', bg: '--accent-fill', min: 4.5, kind: 'text' },
  ...NON_TEXT_TOKENS.flatMap((fg) =>
    SURFACES.map((bg) => ({ fg, bg, min: 3, kind: 'non-text' as const })),
  ),
];

export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`Not a hex colour: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Extracts hex custom properties per theme from tokens.css. The dark block is
 * `:root, :root[data-theme='dark']`; light inherits anything it does not override.
 */
export function parseThemes(css: string): Record<ThemeName, TokenMap> {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const dark: TokenMap = {};
  const light: TokenMap = {};
  for (const [, selector = '', body = ''] of blocks) {
    const target = selector.includes("data-theme='light'")
      ? light
      : selector.includes("data-theme='dark'")
        ? dark
        : null;
    if (!target) continue;
    for (const [, name = '', value = ''] of body.matchAll(
      /(--[\w-]+)\s*:\s*(#[0-9a-f]{3,6})\s*;/gi,
    )) {
      target[name] = value.toLowerCase();
    }
  }
  return { dark, light: { ...dark, ...light } };
}

export interface ContrastResult extends ContrastRequirement {
  theme: ThemeName;
  ratio: number;
  pass: boolean;
}

export function checkThemes(themes: Record<ThemeName, TokenMap>): ContrastResult[] {
  const results: ContrastResult[] = [];
  for (const theme of ['dark', 'light'] as const) {
    const tokens = themes[theme];
    for (const req of REQUIREMENTS) {
      const fg = tokens[req.fg];
      const bg = tokens[req.bg];
      if (!fg || !bg) throw new Error(`Missing token ${!fg ? req.fg : req.bg} in ${theme} theme`);
      const ratio = contrastRatio(fg, bg);
      results.push({ ...req, theme, ratio, pass: ratio >= req.min });
    }
  }
  return results;
}
