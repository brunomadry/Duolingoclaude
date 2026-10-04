/**
 * Merges content/glosses/part-*.json into content/glosses.pl.json (sorted by vocabulary
 * order) and reports missing or unknown ids. Usage: node scripts/merge-glosses.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

interface Gloss {
  pl: string[];
  reviewed: boolean;
}

const content = new URL('../content/', import.meta.url);
const vocab = JSON.parse(readFileSync(new URL('vocab.json', content), 'utf8')) as {
  words: { id: string }[];
};
const parts = readdirSync(new URL('glosses/', content))
  .filter((f) => /^part-.*\.json$/.test(f))
  .sort();

const merged = new Map<string, Gloss>();
for (const file of parts) {
  const data = JSON.parse(readFileSync(new URL(`glosses/${file}`, content), 'utf8')) as {
    glosses: Record<string, Gloss>;
  };
  for (const [id, gloss] of Object.entries(data.glosses)) {
    if (merged.has(id)) console.warn(`duplicate gloss for "${id}" in ${file} (last one wins)`);
    merged.set(id, gloss);
  }
}

const ids = vocab.words.map((w) => w.id);
const known = new Set(ids);
const unknown = [...merged.keys()].filter((id) => !known.has(id));
const missing = ids.filter((id) => !merged.has(id));
const glosses: Record<string, Gloss> = {};
for (const id of ids) {
  const g = merged.get(id);
  if (g)
    glosses[id] = { pl: g.pl.map((s) => s.trim()).filter(Boolean), reviewed: g.reviewed === true };
}

writeFileSync(
  new URL('glosses.pl.json', content),
  `${JSON.stringify({ version: 1, glosses }, null, 2)}\n`,
);
console.log(`${Object.keys(glosses).length} glosses from ${parts.length} part(s).`);
if (unknown.length) console.warn(`ids not in vocab.json: ${unknown.join(', ')}`);
if (missing.length) {
  console.warn(`missing glosses (${missing.length}): ${missing.join(', ')}`);
  process.exitCode = 1;
}
