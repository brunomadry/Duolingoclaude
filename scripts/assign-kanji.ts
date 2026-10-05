/**
 * Attaches the N5 kanji to phase C lessons (content/curriculum.json): two per grammar or
 * practice lesson from L61, the rest in the kanji lessons L94-L97 (their newItem). Kanji are
 * taken in a teaching order (numbers, time, people, places, nature, verbs) and a kanji is
 * only placed in a lesson once a word written with it has been taught, so every kanji
 * comes with known example words (counters such as 円 are known from L47 anyway).
 * Deterministic: rerun after changing the word assignment.
 *
 * Usage: node scripts/assign-kanji.ts [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { writeJson } from './write-formatted.ts';

/** Teaching order. 無, 丈 and 貼 (in the OpenJLPT list, not usual N5) are left out. */
export const KANJI_ORDER = [
  ...'一二三四五六七八九十百千万円',
  ...'日月年時分半今午前後間毎',
  ...'人子男女父母友名先生学校',
  ...'大小高長中上下外右左',
  ...'東西南北山川木水火土金天雨気',
  ...'行来出入見聞読書話食休',
  ...'国語本車電何白誰',
];
const PER_LESSON = 2;
const FIRST_LESSON = 61;

interface LessonJson {
  n: number;
  kind: string;
  words: string[];
  newItem: { type: string; kanji?: string[] };
  kanji?: string[];
  [key: string]: unknown;
}

const content = new URL('../content/', import.meta.url);
const read = <T>(f: string): T => JSON.parse(readFileSync(new URL(f, content), 'utf8')) as T;
const curriculum = read<{ version: 1; lessons: LessonJson[] }>('curriculum.json');
const vocab = read<{ words: { id: string; kanji?: string }[] }>('vocab.json').words;
const known = new Set(read<{ kanji: { char: string }[] }>('kanji.json').kanji.map((k) => k.char));
for (const ch of KANJI_ORDER) if (!known.has(ch)) throw new Error(`${ch} is not in kanji.json`);

/** First lesson that teaches a word written with the kanji. */
const firstWordLesson = new Map<string, number>();
const kanjiOf = new Map(vocab.map((w) => [w.id, w.kanji ?? '']));
for (const l of curriculum.lessons) {
  for (const id of l.words) {
    for (const ch of kanjiOf.get(id) ?? '') {
      if (!firstWordLesson.has(ch)) firstWordLesson.set(ch, l.n);
    }
  }
}

const slots = curriculum.lessons.filter(
  (l) => l.n >= FIRST_LESSON && ['grammar', 'practice', 'kanji'].includes(l.kind),
);
const pending = [...KANJI_ORDER];
const assigned = new Map<number, string[]>();
const kanjiLessons = slots.filter((l) => l.kind === 'kanji');
for (const l of slots) {
  const isLast = l === kanjiLessons.at(-1);
  // Kanji lessons share what is left; the last one takes everything still pending.
  const left = kanjiLessons.filter((k) => k.n >= l.n).length;
  const capacity =
    l.kind === 'kanji' ? (isLast ? Infinity : Math.ceil(pending.length / left)) : PER_LESSON;
  const here: string[] = [];
  for (const ch of [...pending]) {
    if (here.length >= capacity) break;
    // A kanji with no word of its own (円 is only the yen counter) can come any time.
    const at = firstWordLesson.get(ch) ?? FIRST_LESSON;
    if (at > l.n) continue;
    here.push(ch);
    pending.splice(pending.indexOf(ch), 1);
  }
  assigned.set(l.n, here);
}
if (pending.length) throw new Error(`no lesson could take: ${pending.join('')}`);

for (const l of curriculum.lessons) {
  delete l.kanji;
  if (l.kind === 'kanji') l.newItem = { type: 'none' };
  const here = assigned.get(l.n) ?? [];
  if (!here.length) continue;
  if (l.kind === 'kanji') l.newItem = { type: 'kanji', kanji: here };
  else l.kanji = here;
}

for (const [n, here] of assigned) console.log(`L${n}: ${here.join('')}`);
if (!process.argv.includes('--dry-run')) {
  await writeJson(new URL('curriculum.json', content), curriculum);
  console.log(`Assigned ${KANJI_ORDER.length} kanji.`);
}
