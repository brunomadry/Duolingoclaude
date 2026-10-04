/**
 * Imports JLPT N5 vocabulary, example sentences and kanji from OpenJLPT
 * (https://github.com/evanclan/OpenJLPT, CC BY-SA 4.0; sentences from Tatoeba, CC BY 2.0 FR)
 * at a pinned commit, so reruns are reproducible. Writes:
 *   content/vocab.json      words (ids are readable romaji, disambiguated when needed)
 *   content/sentences.json  Tatoeba example sentences (Polish translations added later)
 *   content/kanji.json      N5 kanji (used in Phase 6)
 * Lesson assignment, Polish glosses and the "known words" analysis are separate steps.
 *
 * Usage: node scripts/import-openjlpt.ts   (behind an HTTPS proxy: NODE_USE_ENV_PROXY=1)
 */
import { writeFile } from 'node:fs/promises';
import { kanaToRomaji } from '../src/lesson/romaji.ts';

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
  romaji: string;
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
  const bases = words.map((w) => slug(kanaToRomaji(w.reading)) || 'word');
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

function sortedJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main(): Promise<void> {
  const [vocab, kanji] = await Promise.all([
    getJson<OjWord[]>('data/json/vocab/n5.json'),
    getJson<OjKanji[]>('data/json/kanji/n5.json'),
  ]);
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
      romaji: kanaToRomaji(w.reading),
      en: w.meanings,
      pos: w.pos,
      sentences: examples.map((e) => e.tatoeba_id),
      sourceId: w.id,
    };
  });

  await writeFile(new URL('vocab.json', CONTENT), sortedJson({ version: 1, words }));
  await writeFile(
    new URL('sentences.json', CONTENT),
    sortedJson({
      version: 1,
      sentences: [...sentences.values()].sort((a, b) => Number(a.id) - Number(b.id)),
    }),
  );
  await writeFile(
    new URL('kanji.json', CONTENT),
    sortedJson({
      version: 1,
      kanji: kanji.map((k) => ({
        char: k.character,
        strokes: k.strokes,
        on: k.onyomi,
        kun: k.kunyomi,
        en: k.meanings,
        words: k.words,
      })),
    }),
  );
  console.log(
    `OpenJLPT ${OPENJLPT_COMMIT.slice(0, 10)}: ${words.length} words, ${sentences.size} sentences, ${kanji.length} kanji.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
