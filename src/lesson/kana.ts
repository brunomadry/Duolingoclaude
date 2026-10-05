/**
 * Typed access to content/kana.json: groups, character lookup, accepted romaji
 * and the gojūon chart layout. The JSON is validated by scripts/validate-content.ts
 * and the tests, so here it is only cast to its type (no zod in the client).
 */
import kanaData from '../../content/kana.json';
import type { KanaFile, KanaGroup } from '../shared/content-schema.ts';

export type KanaScript = KanaGroup['script'];
export type KanaKind = KanaGroup['kind'];
export type KanaChar = KanaGroup['chars'][number];
/** Group kinds that sit in the 5-column gojūon grid. */
export type ChartKind = Extract<KanaKind, 'basic' | 'dakuten'>;

export interface KanaLookup {
  char: string;
  romaji: string;
  /** Extra accepted spellings when typing (never shown as the answer); empty when none. */
  alt: readonly string[];
  col?: number;
  mnemonic?: KanaChar['mnemonic'];
  group: KanaGroup;
}

/** A filled cell of the kana chart, with the id of the group that teaches it. */
export type ChartCell = KanaChar & { groupId: string };
/** One chart row; `null` marks a gap (e.g. the missing yi/ye cells in the Y row). */
export type ChartRow = (ChartCell | null)[];

const CHART_WIDTH = 5;
const YOON_WIDTH = 3;
/** Column of the small ya/yu/yo that ends a yōon pair. */
const YOON_COL: Readonly<Record<string, number>> = {
  ゃ: 0,
  ゅ: 1,
  ょ: 2,
  ャ: 0,
  ュ: 1,
  ョ: 2,
};

const data = kanaData as KanaFile;
const groups: readonly KanaGroup[] = data.groups;
const groupIndex = new Map(groups.map((g) => [g.id, g]));
const charIndex = new Map<string, KanaLookup>();
for (const group of groups) {
  for (const c of group.chars) {
    if (charIndex.has(c.char)) continue;
    charIndex.set(c.char, { ...c, alt: c.alt ?? [], group });
  }
}

/** All kana groups in file order (hiragana first, then katakana). */
export function kanaGroups(): readonly KanaGroup[] {
  return groups;
}

export function groupById(id: string): KanaGroup | undefined {
  return groupIndex.get(id);
}

/**
 * Groups for a lesson's `newItem.groups`, in the given order. Unknown ids are
 * skipped (content validation guarantees every curriculum reference exists).
 */
export function groupsForLesson(groupIds: readonly string[]): KanaGroup[] {
  return groupIds.flatMap((id) => groupIndex.get(id) ?? []);
}

/** Every character taught by the given groups, in group then chart order. */
export function charsOf(groupIds: readonly string[]): KanaChar[] {
  return groupsForLesson(groupIds).flatMap((g) => g.chars);
}

export function findKana(char: string): KanaLookup | undefined {
  return charIndex.get(char);
}

/** The Hepburn answer followed by its alternative spellings; empty for unknown kana. */
export function acceptedRomaji(char: string): string[] {
  const k = charIndex.get(char);
  return k ? [k.romaji, ...k.alt] : [];
}

function emptyRow(width: number): ChartRow {
  return Array.from({ length: width }, () => null);
}

/**
 * The gojūon grid for one script as rows of five cells (a, i, u, e, o). Each group
 * starts a new row; inside a group a new row starts whenever the column does not
 * move right (the dakuten group holds four rows). Characters without a column
 * (ん, ン) get a row of their own in the first cell.
 */
export function chartRows(script: KanaScript, kinds: readonly ChartKind[] = ['basic']): ChartRow[] {
  const rows: ChartRow[] = [];
  for (const group of groups) {
    if (group.script !== script || !(kinds as readonly KanaKind[]).includes(group.kind)) continue;
    let row: ChartRow | null = null;
    let lastCol = -1;
    for (const c of group.chars) {
      const cell: ChartCell = { ...c, groupId: group.id };
      if (c.col === undefined) {
        if (row) rows.push(row);
        const own = emptyRow(CHART_WIDTH);
        own[0] = cell;
        rows.push(own);
        row = null;
        lastCol = -1;
        continue;
      }
      if (!row || c.col <= lastCol) {
        if (row) rows.push(row);
        row = emptyRow(CHART_WIDTH);
      }
      row[c.col] = cell;
      lastCol = c.col;
    }
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Yōon combinations as rows of three cells (ya, yu, yo), one row per base kana
 * (き, し, ... ぴ) in file order.
 */
export function yoonRows(script: KanaScript): ChartRow[] {
  const rows = new Map<string, ChartRow>();
  for (const group of groups) {
    if (group.script !== script || group.kind !== 'yoon') continue;
    for (const c of group.chars) {
      const chars = [...c.char];
      const base = chars[0];
      const col = YOON_COL[chars[chars.length - 1] ?? ''];
      if (base === undefined || col === undefined) continue;
      let row = rows.get(base);
      if (!row) {
        row = emptyRow(YOON_WIDTH);
        rows.set(base, row);
      }
      row[col] = { ...c, groupId: group.id };
    }
  }
  return [...rows.values()];
}
