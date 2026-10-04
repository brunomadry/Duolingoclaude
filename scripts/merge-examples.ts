/**
 * Merges content/examples/part-*.json into content/examples.json, ordered by lesson and by
 * the word order inside each lesson. Usage: node scripts/merge-examples.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

interface ExampleJson {
  wordId: string;
  lesson: number;
  [key: string]: unknown;
}

const content = new URL('../content/', import.meta.url);
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
  all.push(...data.examples);
}
all.sort((a, b) => a.lesson - b.lesson || (order.get(a.wordId) ?? 0) - (order.get(b.wordId) ?? 0));
writeFileSync(
  new URL('examples.json', content),
  `${JSON.stringify({ version: 1, examples: all }, null, 2)}\n`,
);
console.log(`${all.length} examples from ${parts.length} part(s).`);
