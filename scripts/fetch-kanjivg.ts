/**
 * Downloads stroke order data from KanjiVG (https://kanjivg.tagaini.net/, CC BY-SA 3.0,
 * Ulrich Apel and contributors) and writes content/strokes.json (StrokesFile in
 * src/shared/content-schema.ts). Only the stroke paths are kept, in stroke order.
 *
 * Usage:
 *   node scripts/fetch-kanjivg.ts
 *     Refreshes all hiragana (U+3041..U+3096), katakana (U+30A1..U+30FA), ー (U+30FC)
 *     and every character already present in content/strokes.json.
 *   node scripts/fetch-kanjivg.ts --chars 日本語
 *     Fetches only these characters and merges them into content/strokes.json
 *     (the kana set is fetched too when the file does not exist yet).
 *
 * Characters that KanjiVG does not have (HTTP 404) are logged and skipped. Behind an
 * HTTPS proxy, run with NODE_USE_ENV_PROXY=1 (Node 22.21+) so fetch() honours it.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { StrokesFile } from '../src/shared/content-schema.ts';

export const KANJIVG_BASE_URL = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/';
export const KANJIVG_VIEWBOX = '0 0 109 109';

const OUT_URL = new URL('../content/strokes.json', import.meta.url);
const CONCURRENCY = 6;
const ATTEMPTS = 4;
const TIMEOUT_MS = 20_000;

/* ------------------------------------------------------------ pure helpers */

function range(from: number, to: number): string[] {
  const out: string[] = [];
  for (let cp = from; cp <= to; cp++) out.push(String.fromCodePoint(cp));
  return out;
}

/** Hiragana U+3041..U+3096, katakana U+30A1..U+30FA and the long vowel mark ー (U+30FC). */
export function defaultChars(): string[] {
  return [...range(0x3041, 0x3096), ...range(0x30a1, 0x30fa), 'ー'];
}

/** KanjiVG names files by the 5-digit lowercase hex code point: あ -> "03042". */
export function kanjiVgCode(char: string): string {
  const cp = char.codePointAt(0);
  if (cp === undefined) throw new Error('empty character');
  return cp.toString(16).padStart(5, '0');
}

export function kanjiVgUrl(char: string): string {
  return `${KANJIVG_BASE_URL}${kanjiVgCode(char)}.svg`;
}

/** "U+3042" style label for logs. */
export function codePointLabel(char: string): string {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Sorts characters by code point (the order used for keys in strokes.json). */
export function byCodePoint(a: string, b: string): number {
  return (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0);
}

/**
 * Splits a --chars argument into unique characters sorted by code point. Whitespace is
 * ignored; characters outside the BMP are rejected because strokes.json keys must be a
 * single UTF-16 unit (the schema checks `length(1)`).
 */
export function parseCharsArg(input: string): { chars: string[]; rejected: string[] } {
  const chars = new Set<string>();
  const rejected = new Set<string>();
  for (const ch of input) {
    if (/\s/u.test(ch)) continue;
    if (ch.length !== 1) rejected.add(ch);
    else chars.add(ch);
  }
  return { chars: [...chars].sort(byCodePoint), rejected: [...rejected] };
}

function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
    if (m[1] !== undefined && m[2] !== undefined) attrs.set(m[1], m[2]);
  }
  return attrs;
}

export interface ParsedGlyph {
  viewBox: string;
  /** Path `d` strings in stroke order (s1, s2, ...). */
  strokes: string[];
}

/**
 * Extracts the stroke paths of one KanjiVG SVG. Strokes are the <path> elements whose id
 * is "kvg:<code>-s<N>"; they are ordered by N, not by document order, and the numbers
 * must run 1..n without gaps. Throws on anything unexpected.
 */
export function parseKanjiVgSvg(svg: string, char: string): ParsedGlyph {
  const code = kanjiVgCode(char);
  const svgTag = /<svg\b[^>]*>/.exec(svg)?.[0];
  const viewBox = svgTag ? attributes(svgTag).get('viewBox') : undefined;
  if (!viewBox) throw new Error(`${code}.svg: no viewBox on <svg>`);

  const idPattern = new RegExp(`^kvg:${code}-s(\\d+)$`);
  const numbered: { n: number; d: string }[] = [];
  for (const m of svg.matchAll(/<path\b[^>]*>/g)) {
    const attrs = attributes(m[0]);
    const n = idPattern.exec(attrs.get('id') ?? '')?.[1];
    if (n === undefined) continue;
    const d = attrs.get('d')?.trim();
    if (!d) throw new Error(`${code}.svg: stroke s${n} has no "d" attribute`);
    numbered.push({ n: Number(n), d });
  }
  if (numbered.length === 0) throw new Error(`${code}.svg: no stroke paths found`);

  numbered.sort((a, b) => a.n - b.n);
  numbered.forEach((s, i) => {
    if (s.n !== i + 1) throw new Error(`${code}.svg: stroke numbers are not 1..n (found s${s.n})`);
  });
  return { viewBox: viewBox.trim().split(/\s+/).join(' '), strokes: numbered.map((s) => s.d) };
}

/** Builds the file with keys sorted by code point, so reruns produce stable diffs. */
export function buildStrokesFile(viewBox: string, chars: ReadonlyMap<string, string[]>): StrokesFile {
  const sorted: StrokesFile['chars'] = {};
  for (const ch of [...chars.keys()].sort(byCodePoint)) {
    const strokes = chars.get(ch);
    if (strokes) sorted[ch] = { strokes };
  }
  return { version: 1, source: 'kanjivg', viewBox, chars: sorted };
}

/* ---------------------------------------------------------------- network */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
  }
}

/** Returns the SVG text, or null on 404. Retries network errors, timeouts, 429 and 5xx. */
async function fetchSvg(char: string): Promise<string | null> {
  const url = kanjiVgUrl(char);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 404) return null;
      if (!res.ok) throw new HttpError(res.status, url);
      return await res.text();
    } catch (err) {
      const retryable = !(err instanceof HttpError) || err.status === 429 || err.status >= 500;
      if (!retryable || attempt >= ATTEMPTS) throw err;
      const wait = 500 * 2 ** (attempt - 1);
      console.warn(`retry ${char} (${codePointLabel(char)}) in ${wait} ms: ${String(err)}`);
      await sleep(wait);
    }
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/* ------------------------------------------------------------------- main */

async function readExisting(): Promise<StrokesFile | undefined> {
  if (!existsSync(OUT_URL)) return undefined;
  const parsed = StrokesFile.safeParse(JSON.parse(await readFile(OUT_URL, 'utf8')));
  if (!parsed.success) {
    throw new Error(`content/strokes.json is invalid, fix or delete it first:\n${parsed.error.message}`);
  }
  return parsed.data;
}

async function formatJson(data: StrokesFile): Promise<string> {
  // Prettier is already a dev dependency; using it keeps `prettier --check .` green.
  const prettier = await import('prettier');
  const path = fileURLToPath(OUT_URL);
  const options = (await prettier.resolveConfig(path)) ?? {};
  return prettier.format(JSON.stringify(data, null, 2), { ...options, filepath: path });
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { chars: { type: 'string' } }, strict: true });
  const existing = await readExisting();

  const targets = new Set<string>();
  if (values.chars !== undefined) {
    const { chars, rejected } = parseCharsArg(values.chars);
    if (rejected.length) console.warn(`skip (outside the BMP): ${rejected.join(' ')}`);
    chars.forEach((c) => targets.add(c));
    if (!existing) defaultChars().forEach((c) => targets.add(c));
  } else {
    defaultChars().forEach((c) => targets.add(c));
    Object.keys(existing?.chars ?? {}).forEach((c) => targets.add(c));
  }
  const list = [...targets].sort(byCodePoint);
  console.log(`Fetching ${list.length} character(s) from KanjiVG (concurrency ${CONCURRENCY})...`);

  const fetched = new Map<string, string[]>();
  const missing: string[] = [];
  const viewBoxes = new Set<string>();
  await mapPool(list, CONCURRENCY, async (char) => {
    const svg = await fetchSvg(char);
    if (svg === null) {
      missing.push(char);
      return;
    }
    const glyph = parseKanjiVgSvg(svg, char);
    viewBoxes.add(glyph.viewBox);
    fetched.set(char, glyph.strokes);
  });

  const viewBox = existing?.viewBox ?? [...viewBoxes][0] ?? KANJIVG_VIEWBOX;
  for (const vb of viewBoxes) {
    if (vb !== viewBox) throw new Error(`KanjiVG viewBox changed: "${vb}" vs "${viewBox}"`);
  }

  const merged = new Map<string, string[]>(Object.entries(existing?.chars ?? {}).map(([c, v]) => [c, v.strokes]));
  for (const [c, strokes] of fetched) merged.set(c, strokes);
  const file = StrokesFile.parse(buildStrokesFile(viewBox, merged));
  const text = await formatJson(file);

  const previous = existsSync(OUT_URL) ? await readFile(OUT_URL, 'utf8') : '';
  if (text !== previous) await writeFile(OUT_URL, text);

  missing.sort(byCodePoint);
  const kept = missing.filter((c) => merged.has(c));
  console.log(`Fetched ${fetched.size} of ${list.length} character(s); viewBox "${viewBox}".`);
  if (missing.length) {
    console.log(`Not in KanjiVG (404, skipped): ${missing.map((c) => `${c} ${codePointLabel(c)}`).join(', ')}`);
  }
  if (kept.length) console.warn(`Kept previous data for: ${kept.join(' ')}`);
  const kb = (Buffer.byteLength(text) / 1024).toFixed(1);
  console.log(
    `${text === previous ? 'Unchanged' : 'Wrote'} content/strokes.json: ${Object.keys(file.chars).length} character(s), ${kb} KiB.`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
