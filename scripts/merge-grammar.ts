/**
 * Merges content/grammar/part-*.json into content/grammar.json, ordered by the lesson that
 * teaches each grammar point. Usage: node scripts/merge-grammar.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { writeJson } from './write-formatted.ts';

interface NoteJson {
  id: string;
  [key: string]: unknown;
}

const content = new URL('../content/', import.meta.url);
const curriculum = JSON.parse(readFileSync(new URL('curriculum.json', content), 'utf8')) as {
  lessons: { n: number; newItem: { grammarId?: string } }[];
};
const lessonOf = new Map<string, number>();
for (const l of curriculum.lessons) if (l.newItem.grammarId) lessonOf.set(l.newItem.grammarId, l.n);

const parts = readdirSync(new URL('grammar/', content))
  .filter((f) => /^part-.*\.json$/.test(f))
  .sort();
const notes = new Map<string, NoteJson>();
for (const file of parts) {
  const data = JSON.parse(readFileSync(new URL(`grammar/${file}`, content), 'utf8')) as {
    notes: NoteJson[];
  };
  for (const note of data.notes) {
    if (notes.has(note.id)) console.warn(`duplicate note "${note.id}" in ${file} (last one wins)`);
    notes.set(note.id, note);
  }
}
const ordered = [...notes.values()].sort(
  (a, b) => (lessonOf.get(a.id) ?? 999) - (lessonOf.get(b.id) ?? 999),
);
await writeJson(new URL('grammar.json', content), { version: 1, notes: ordered });
const missing = [...lessonOf.keys()].filter((id) => !notes.has(id));
console.log(`${ordered.length} notes from ${parts.length} part(s).`);
if (missing.length) {
  console.warn(`missing notes (${missing.length}): ${missing.join(', ')}`);
  process.exitCode = 1;
}
