/**
 * Writes docs/glosses-spot-check.md: 30 random (but reproducible) vocabulary entries with
 * their Polish glosses, for a human to eyeball. Usage: node scripts/gloss-spot-check.ts [seed]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const content = new URL('../content/', import.meta.url);
const vocab = JSON.parse(readFileSync(new URL('vocab.json', content), 'utf8')) as {
  words: { id: string; kana: string; kanji?: string; romaji: string; en: string[] }[];
};
const { glosses } = JSON.parse(readFileSync(new URL('glosses.pl.json', content), 'utf8')) as {
  glosses: Record<string, { pl: string[]; reviewed: boolean }>;
};

let seed = Number(process.argv[2] ?? 20261004) >>> 0;
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pool = [...vocab.words];
const sample: typeof pool = [];
while (sample.length < 30 && pool.length) {
  const [picked] = pool.splice(Math.floor(rand() * pool.length), 1);
  if (picked) sample.push(picked);
}

const rows = sample.map((w, i) => {
  const g = glosses[w.id];
  return `| ${i + 1} | ${w.kanji ?? ''} | ${w.kana} | ${w.romaji} | ${w.en.slice(0, 3).join('; ')} | ${g ? g.pl.join('; ') : '**BRAK**'} | [ ] |`;
});

const doc = `# Glosy: kontrola wyrywkowa

30 losowych słówek z \`content/glosses.pl.json\` (ziarno losowania: ${process.argv[2] ?? 20261004}).
Polskie znaczenia wygenerował model językowy jednorazowo, na podstawie angielskich glos z OpenJLPT,
i mają flagę \`reviewed: false\`. Zaznacz [x] przy poprawnych, a błędy zgłoś (albo popraw w pliku).

| # | Kanji | Kana | Romaji | Angielski (OpenJLPT) | Polski | OK? |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
writeFileSync(new URL('../docs/glosses-spot-check.md', import.meta.url), doc);
console.log('Wrote docs/glosses-spot-check.md');
