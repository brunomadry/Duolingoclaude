/**
 * Merges content/examples/part-*.json into content/examples.json, ordered by lesson and by
 * the word order inside each lesson, and adds the generated romaji of each sentence (from
 * its kana reading, see src/lesson/sentence-romaji.ts). Usage: node scripts/merge-examples.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { sentenceRomaji } from '../src/lesson/sentence-romaji.ts';
import { createLexicon, tokenize, type LexEntry } from '../src/shared/jp-words.ts';
import { writeJson } from './write-formatted.ts';

interface ExampleJson {
  wordId: string;
  lesson: number;
  ja: string;
  kana?: string;
  romaji?: string;
  [key: string]: unknown;
}

const content = new URL('../content/', import.meta.url);
const vocab = (
  JSON.parse(readFileSync(new URL('vocab.json', content), 'utf8')) as {
    words: (LexEntry & { romaji: string })[];
  }
).words;
const lexicon = createLexicon(vocab.map((w) => ({ ...w, pos: w.pos ?? [] })));
const wordById = new Map(vocab.map((w) => [w.id, w]));
const curriculum = JSON.parse(readFileSync(new URL('curriculum.json', content), 'utf8')) as {
  lessons: { n: number; words: string[] }[];
};
const order = new Map<string, number>();
for (const l of curriculum.lessons) l.words.forEach((w, i) => order.set(w, l.n * 100 + i));

const parts = readdirSync(new URL('examples/', content))
  .filter((f) => /^part-.*\.json$/.test(f))
  .sort();
const all: ExampleJson[] = [];
for (const file of parts) {
  const data = JSON.parse(readFileSync(new URL(`examples/${file}`, content), 'utf8')) as {
    examples: ExampleJson[];
  };
  for (const ex of data.examples) {
    const rest = { ...ex };
    delete rest.romaji;
    const reading = ex.kana ?? ex.ja;
    // Romaji only from a pure kana reading; a kanji sentence without one gets none.
    const romaji = /[\u3400-\u9fff々]/.test(reading)
      ? undefined
      : sentenceRomaji(tokenize(reading, lexicon), (id) => wordById.get(id));
    all.push({ ...rest, ...(romaji ? { romaji } : {}) });
  }
}
all.sort((a, b) => a.lesson - b.lesson || (order.get(a.wordId) ?? 0) - (order.get(b.wordId) ?? 0));
await writeJson(new URL('examples.json', content), { version: 1, examples: all });
console.log(`${all.length} examples from ${parts.length} part(s).`);
