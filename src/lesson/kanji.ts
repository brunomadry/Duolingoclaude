/**
 * Kanji for the client: which kanji each lesson teaches, their readings and Polish
 * meanings, when a word or sentence may be shown with kanji (all of its kanji are known),
 * and furigana aligned to the okurigana (食べる: 食 is read た). Pure.
 */

export interface KanjiItem {
  char: string;
  /** On readings (katakana) and kun readings (hiragana), as in KANJIDIC. */
  on: string[];
  kun: string[];
  pl: string[];
  strokes: number;
  /** Lesson that teaches the kanji, or null when the course does not teach it. */
  lesson: number | null;
}

export interface RawKanji {
  kanji: { char: string; strokes: number; on: string[]; kun: string[]; en: string[] }[];
}
export interface RawKanjiGlosses {
  kanji: Record<string, { pl: string[] }>;
}
export interface RawKanjiCurriculum {
  lessons: {
    n: number;
    kanji?: readonly string[];
    newItem: { type: string; kanji?: readonly string[] };
  }[];
}

export interface KanjiIndex {
  /** Taught kanji in lesson order. */
  items: KanjiItem[];
  byChar: ReadonlyMap<string, KanjiItem>;
  byLesson: ReadonlyMap<number, KanjiItem[]>;
}

export const KANJI_CARD_PREFIX = 'kanji:';

export function kanjiCardId(char: string): string {
  return `${KANJI_CARD_PREFIX}${char}`;
}

export function kanjiFromCardId(cardId: string): string | null {
  return cardId.startsWith(KANJI_CARD_PREFIX) ? cardId.slice(KANJI_CARD_PREFIX.length) : null;
}

/** Kanji a lesson teaches (its `kanji` field or a kanji lesson's new item). */
export function lessonKanji(l: RawKanjiCurriculum['lessons'][number]): readonly string[] {
  return [...(l.kanji ?? []), ...(l.newItem.type === 'kanji' ? (l.newItem.kanji ?? []) : [])];
}

export function buildKanjiIndex(
  raw: RawKanji,
  glosses: RawKanjiGlosses,
  curriculum: RawKanjiCurriculum,
): KanjiIndex {
  const data = new Map(raw.kanji.map((k) => [k.char, k]));
  const items: KanjiItem[] = [];
  const byLesson = new Map<number, KanjiItem[]>();
  for (const l of curriculum.lessons) {
    for (const char of lessonKanji(l)) {
      const k = data.get(char);
      if (!k) continue;
      const item: KanjiItem = {
        char,
        on: k.on,
        kun: k.kun,
        pl: glosses.kanji[char]?.pl ?? k.en.slice(0, 2),
        strokes: k.strokes,
        lesson: l.n,
      };
      items.push(item);
      byLesson.set(l.n, [...(byLesson.get(l.n) ?? []), item]);
    }
  }
  return { items, byChar: new Map(items.map((k) => [k.char, k])), byLesson };
}

export function kanjiUpTo(index: KanjiIndex, n: number): Set<string> {
  return new Set(index.items.filter((k) => k.lesson !== null && k.lesson <= n).map((k) => k.char));
}

const KANJI_CHAR = /[㐀-鿿々]/;

export function hasKanji(text: string): boolean {
  return KANJI_CHAR.test(text);
}

/** True when every kanji in the text is known (々 repeats the previous one). */
export function kanjiKnown(text: string, known: ReadonlySet<string>): boolean {
  return [...text].every((ch) => !KANJI_CHAR.test(ch) || ch === '々' || known.has(ch));
}

/**
 * A KANJIDIC reading for display: "た.べる" -> "た(べる)" (okurigana in brackets),
 * "-び" -> "び", "ひと-" -> "ひと".
 */
export function readingLabel(reading: string): string {
  const [stem = '', okurigana] = reading.replace(/-/g, '').split('.');
  return okurigana ? `${stem}(${okurigana})` : stem;
}

/** The most useful readings first (short list for cards): up to 3 on and 3 kun. */
export function readingsOf(k: Pick<KanjiItem, 'on' | 'kun'>): { on: string[]; kun: string[] } {
  const unique = (list: readonly string[]) => [...new Set(list.map(readingLabel))].filter(Boolean);
  return { on: unique(k.on).slice(0, 3), kun: unique(k.kun).slice(0, 3) };
}

export interface RubyPart {
  text: string;
  /** Reading of a kanji run; absent for kana. */
  rt?: string;
}

const toHiragana = (text: string) =>
  text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/**
 * Splits a written word into kana and kanji runs, with the reading of each kanji run taken
 * from the word's reading: 食べる/たべる -> 食(た) べる; 男の子/おとこのこ -> 男(おとこ) の 子(こ).
 * When the two do not line up, the whole word gets the whole reading.
 */
export function furigana(written: string, reading: string): RubyPart[] {
  if (!hasKanji(written)) return [{ text: written }];
  const runs = written.match(/[㐀-鿿々]+|[^㐀-鿿々]+/g) ?? [written];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = runs.map((r) => (hasKanji(r) ? '(.+?)' : escape(toHiragana(r)))).join('');
  const match = new RegExp(`^${pattern}$`).exec(toHiragana(reading));
  if (!match) return [{ text: written, rt: reading }];
  let group = 1;
  return runs.map((r) => (hasKanji(r) ? { text: r, rt: match[group++] ?? '' } : { text: r }));
}
