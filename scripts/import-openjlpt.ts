/**
 * Imports JLPT N5 vocabulary, example sentences and kanji from OpenJLPT
 * (https://github.com/evanclan/OpenJLPT, CC BY-SA 4.0; sentences from Tatoeba, CC BY 2.0 FR)
 * at a pinned commit, so reruns are reproducible. Writes:
 *   content/vocab.json      words (ids are readable romaji, disambiguated when needed)
 *   content/sentences.json  Tatoeba example sentences (Polish translations added later)
 *   content/kanji.json      N5 kanji (used in Phase 6)
 * Lesson assignment, Polish glosses and the "known words" analysis are separate steps.
 *
 * Two small, reviewed additions on top of OpenJLPT (see docs/DECISIONS.md):
 *   CORRECTIONS  fixes to OpenJLPT entries whose data is wrong for N5;
 *   SUPPLEMENT   essential beginner words missing from OpenJLPT, taken from JMdict
 *                (jmdict-simplified 3.6.2, dictDate 2026-09-28; entry sequence numbers
 *                kept in sourceId), plus three course words about Poland.
 *
 * Usage: node scripts/import-openjlpt.ts   (behind an HTTPS proxy: NODE_USE_ENV_PROXY=1)
 */
import { kanaToRomaji } from '../src/lesson/romaji.ts';
import { writeJson } from './write-formatted.ts';

export const OPENJLPT_COMMIT = '0d1d3410bec90bd4098a7c72de820543cb4f707c';
const RAW = `https://raw.githubusercontent.com/evanclan/OpenJLPT/${OPENJLPT_COMMIT}/`;
const CONTENT = new URL('../content/', import.meta.url);

interface OjExample {
  ja: string;
  /** Missing when the sentence has no kanji. */
  furigana?: string;
  en: string;
  tatoeba_id: number;
}

interface OjWord {
  id: string;
  word: string;
  reading: string;
  meanings: string[];
  pos: string[];
  examples?: OjExample[];
}

interface OjKanji {
  character: string;
  strokes: number;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
  words: string[];
}

/**
 * Fixes keyed by OpenJLPT id, found in the gloss review. Applied before ids are assigned,
 * so a corrected first meaning also gives a better id (厚い is "atsui-thick").
 */
export const CORRECTIONS: Readonly<
  Record<string, Partial<Pick<OjWord, 'word' | 'meanings' | 'pos'>>>
> = {
  // 厚い: "kind, deep" belong to 篤い.
  '9949d87445': { meanings: ['thick'] },
  // せっけん: the N5 word (and both attached sentences) is soap, not 節倹 "economy".
  b48d0c99d4: { meanings: ['soap'], pos: ['n'] },
  // 半分: garbled "half minute".
  a1cda8cb11: { meanings: ['half'] },
  // 四日: typo.
  '222ae96df7': { meanings: ['four days', 'fourth day of the month'] },
  // 一日: "first of the month" is the ついたち reading.
  '1cfccd0cdd': { meanings: ['one day', 'all day'] },
  // Current okurigana.
  d7960dc78d: { word: '終わる' },
  ae3e0a705f: { word: '曲がる' },
  // ぬるい is written in kana; 温い usually reads あたたかい.
  '2f01adebd7': { word: 'ぬるい', meanings: ['lukewarm'] },
  // Missing usual kanji.
  a45af4ed89: { word: '立派' },
  '34784ed6ca': { word: '風呂' },
  // Senses that are not N5.
  '6e6a06687d': { meanings: ['bag'] },
  cd1bcc2b1b: { meanings: ['busy'] },
  '2dbe65ee1d': { meanings: ['postbox', 'mailbox'] },
};

/** Words added to the N5 list (no Tatoeba sentences: lessons get original examples). */
export const SUPPLEMENT: readonly OjWord[] = [
  { id: 'jmdict:1311110', word: '私', reading: 'わたし', meanings: ['I', 'me'], pos: ['pn'] },
  { id: 'jmdict:1582710', word: '日本', reading: 'にほん', meanings: ['Japan'], pos: ['n'] },
  {
    id: 'jmdict:1464700',
    word: '日本人',
    reading: 'にほんじん',
    meanings: ['Japanese person'],
    pos: ['n'],
  },
  {
    id: 'jmdict:1464530',
    word: '日本語',
    reading: 'にほんご',
    meanings: ['Japanese (language)'],
    pos: ['n'],
  },
  { id: 'jmdict:1497610', word: '父', reading: 'ちち', meanings: ['(humble) father'], pos: ['n'] },
  { id: 'jmdict:1514990', word: '母', reading: 'はは', meanings: ['(humble) mother'], pos: ['n'] },
  {
    id: 'jmdict:1217730',
    word: '顔',
    reading: 'かお',
    meanings: ['face', '(facial) expression'],
    pos: ['n'],
  },
  {
    id: 'jmdict:1007130',
    word: 'そんな',
    reading: 'そんな',
    meanings: ['such', 'that kind of'],
    pos: ['adj-pn'],
  },
  {
    id: 'jmdict:1009330',
    word: 'どんな',
    reading: 'どんな',
    meanings: ['what kind of'],
    pos: ['adj-pn'],
  },
  {
    id: 'jmdict:1000590',
    word: 'あんな',
    reading: 'あんな',
    meanings: ['that kind of', 'like that'],
    pos: ['adj-pn'],
  },
  {
    id: 'course:poland',
    word: 'ポーランド',
    reading: 'ポーランド',
    meanings: ['Poland'],
    pos: ['n'],
  },
  {
    id: 'course:polish-person',
    word: 'ポーランド人',
    reading: 'ポーランドじん',
    meanings: ['Polish person'],
    pos: ['n'],
  },
  {
    id: 'course:polish-language',
    word: 'ポーランド語',
    reading: 'ポーランドご',
    meanings: ['Polish (language)'],
    pos: ['n'],
  },
];

async function getJson<T>(path: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(RAW + path);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return (await res.json()) as T;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "{会|あ}われました" -> "あわれました" (kana reading of a furigana-annotated sentence). */
export function furiganaToKana(furigana: string): string {
  return furigana.replace(/\{([^|}]*)\|([^}]*)\}/g, '$2');
}

/**
 * Lexicalised words whose は is the particle (read wa). kanaToRomaji cannot know that from
 * kana alone, so these are fixed here (Modified Hepburn).
 */
export const LEXICAL_ROMAJI: Readonly<Record<string, string>> = {
  こんにちは: 'konnichiwa',
  こんばんは: 'konbanwa',
  では: 'dewa',
  それでは: 'soredewa',
};

export function romajiOf(reading: string): string {
  return LEXICAL_ROMAJI[reading] ?? kanaToRomaji(reading);
}

const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'or', 'something', 'someone', 'from']);

/** Up to two meaningful words of an English gloss: "to put on from the shoulders" -> "put-on". */
export function meaningSlug(meaning: string): string {
  return slug(meaning)
    .split('-')
    .filter((w) => w && !STOP_WORDS.has(w))
    .slice(0, 2)
    .join('-');
}

/** Readable, stable ids: romaji, plus a short meaning when two words share romaji. */
export function assignIds(words: readonly { reading: string; meanings: string[] }[]): string[] {
  const bases = words.map((w) => slug(romajiOf(w.reading)) || 'word');
  const counts = new Map<string, number>();
  for (const b of bases) counts.set(b, (counts.get(b) ?? 0) + 1);
  const used = new Set<string>();
  return words.map((w, i) => {
    const base = bases[i] ?? 'word';
    let id =
      (counts.get(base) ?? 0) > 1 ? `${base}-${meaningSlug(w.meanings[0] ?? '') || 'x'}` : base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

async function main(): Promise<void> {
  const [openJlpt, kanji] = await Promise.all([
    getJson<OjWord[]>('data/json/vocab/n5.json'),
    getJson<OjKanji[]>('data/json/kanji/n5.json'),
  ]);
  const vocab = [
    ...openJlpt.map((w) => ({ ...w, ...CORRECTIONS[w.id] })),
    ...SUPPLEMENT.filter(
      (s) => !openJlpt.some((w) => w.word === s.word && w.reading === s.reading),
    ),
  ];
  // Deterministic order: by reading, then written form.
  vocab.sort(
    (a, b) => a.reading.localeCompare(b.reading, 'ja') || a.word.localeCompare(b.word, 'ja'),
  );
  const ids = assignIds(vocab);

  const sentences = new Map<number, Record<string, unknown>>();
  const words = vocab.map((w, i) => {
    const examples = w.examples ?? [];
    for (const ex of examples) {
      if (!sentences.has(ex.tatoeba_id)) {
        // Kana reading only when it is reliable: from furigana, or a sentence without kanji.
        const hasKanji = /[\u3400-\u9fff々]/.test(ex.ja);
        const kana = ex.furigana ? furiganaToKana(ex.furigana) : hasKanji ? undefined : ex.ja;
        sentences.set(ex.tatoeba_id, {
          id: ex.tatoeba_id,
          ja: ex.ja,
          ...(ex.furigana && ex.furigana !== ex.ja ? { furigana: ex.furigana } : {}),
          ...(kana !== undefined ? { kana } : {}),
          en: ex.en,
          words: [],
          source: 'tatoeba',
        });
      }
    }
    return {
      id: ids[i],
      kana: w.reading,
      ...(w.word !== w.reading ? { kanji: w.word } : {}),
      romaji: romajiOf(w.reading),
      en: w.meanings,
      pos: w.pos,
      ...(examples.length ? { sentences: examples.map((e) => e.tatoeba_id) } : {}),
      sourceId: w.id,
    };
  });

  await writeJson(new URL('vocab.json', CONTENT), { version: 1, words });
  await writeJson(new URL('sentences.json', CONTENT), {
    version: 1,
    sentences: [...sentences.values()].sort((a, b) => Number(a.id) - Number(b.id)),
  });
  await writeJson(new URL('kanji.json', CONTENT), {
    version: 1,
    kanji: kanji.map((k) => ({
      char: k.character,
      strokes: k.strokes,
      on: k.onyomi,
      kun: k.kunyomi,
      en: k.meanings,
      words: k.words,
    })),
  });
  console.log(
    `OpenJLPT ${OPENJLPT_COMMIT.slice(0, 10)}: ${words.length} words (${vocab.length - openJlpt.length} supplemented), ${sentences.size} sentences, ${kanji.length} kanji.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
