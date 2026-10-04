/**
 * Helper for assigning vocabulary to lessons (content/curriculum.json `words`).
 *
 *   node scripts/curriculum-tool.ts show [from] [to]
 *     Lessons with their kind, grammar point and words (kana, kanji, Polish gloss).
 *   node scripts/curriculum-tool.ts unassigned [posRegex] [--readable <lesson>]
 *     Words not taught by any lesson, optionally filtered by part of speech (e.g. "^v")
 *     or by "readable with the kana taught up to <lesson>".
 *   node scripts/curriculum-tool.ts set <lesson> <id,id,...>
 *     Replaces the words of a lesson (an empty list clears it). Refuses unknown ids, ids
 *     taught elsewhere, more than MAX_WORDS_PER_LESSON words, words in tests, and
 *     writing-phase words that use kana not taught yet. Re-reads the file on every call.
 *   node scripts/curriculum-tool.ts move <id> <lesson>
 *     Moves one word to another lesson (same checks).
 *   node scripts/curriculum-tool.ts stats
 *     Words per lesson and how many words are still unassigned.
 */
import { readFileSync } from 'node:fs';
import { KANA_PHASE_END, MAX_WORDS_PER_LESSON } from '../src/shared/constants.ts';
import { writeJson } from './write-formatted.ts';

const content = new URL('../content/', import.meta.url);
const read = <T>(file: string): T => JSON.parse(readFileSync(new URL(file, content), 'utf8')) as T;

interface Word {
  id: string;
  kana: string;
  kanji?: string;
  pos?: string[];
  en: string[];
}
interface LessonJson {
  n: number;
  kind: string;
  title: string;
  words: string[];
  newItem: { type: string; grammarId?: string; groups?: string[] };
}
interface CurriculumJson {
  lessons: LessonJson[];
}
interface KanaJson {
  groups: { id: string; chars: { char: string }[] }[];
}

const vocab = read<{ words: Word[] }>('vocab.json').words;
const byId = new Map(vocab.map((w) => [w.id, w]));
const glosses = read<{ glosses: Record<string, { pl: string[] }> }>('glosses.pl.json').glosses;
const kana = read<KanaJson>('kana.json');
const groupChars = new Map(kana.groups.map((g) => [g.id, g.chars.flatMap((c) => [...c.char])]));

const loadCurriculum = () => read<CurriculumJson>('curriculum.json');

/** Kana a learner can read at the end of lesson n (all kana after the writing phase). */
function kanaKnownAt(curriculum: CurriculumJson, n: number): Set<string> | null {
  if (n > KANA_PHASE_END) return null;
  const known = new Set<string>(['ー']);
  for (const l of curriculum.lessons) {
    if (l.n > n) break;
    if (l.newItem.type === 'kana')
      for (const g of l.newItem.groups ?? [])
        for (const ch of groupChars.get(g) ?? []) known.add(ch);
  }
  return known;
}

const unreadable = (w: Word, known: Set<string> | null) =>
  known ? [...new Set([...w.kana].filter((ch) => !known.has(ch)))] : [];

const describe = (id: string) => {
  const w = byId.get(id);
  if (!w) return `${id} (MISSING)`;
  return `${id}\t${w.kanji ?? ''}\t${w.kana}\t${(w.pos ?? []).join(',')}\t${(glosses[id]?.pl ?? w.en).join('; ')}`;
};

function lessonOfWord(curriculum: CurriculumJson): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of curriculum.lessons) for (const w of l.words) map.set(w, l.n);
  return map;
}

function problemsFor(curriculum: CurriculumJson, lesson: LessonJson, ids: string[]): string[] {
  const problems: string[] = [];
  const taught = lessonOfWord(curriculum);
  if (lesson.kind === 'test' && ids.length) problems.push(`lesson ${lesson.n} is a test`);
  if (ids.length > MAX_WORDS_PER_LESSON)
    problems.push(`${ids.length} words (max ${MAX_WORDS_PER_LESSON})`);
  if (new Set(ids).size !== ids.length) problems.push('duplicate ids in the list');
  const known = kanaKnownAt(curriculum, lesson.n);
  for (const id of ids) {
    const w = byId.get(id);
    if (!w) {
      problems.push(`unknown id "${id}"`);
      continue;
    }
    const at = taught.get(id);
    if (at !== undefined && at !== lesson.n) problems.push(`"${id}" is already in lesson ${at}`);
    const missing = unreadable(w, known);
    if (missing.length)
      problems.push(`"${id}" (${w.kana}) uses kana not taught yet: ${missing.join('')}`);
  }
  return problems;
}

async function setWords(lessonN: number, ids: string[]): Promise<boolean> {
  const curriculum = loadCurriculum();
  const lesson = curriculum.lessons.find((l) => l.n === lessonN);
  if (!lesson) {
    console.error(`no lesson ${lessonN}`);
    return false;
  }
  const problems = problemsFor(curriculum, lesson, ids);
  if (problems.length) {
    console.error(`lesson ${lessonN} not changed:\n  ${problems.join('\n  ')}`);
    return false;
  }
  lesson.words = ids;
  await writeJson(new URL('curriculum.json', content), curriculum);
  console.log(`L${lessonN} ${lesson.title}: ${ids.length ? ids.join(', ') : '(no words)'}`);
  return true;
}

const args = process.argv.slice(2);
const [cmd, a, b] = args;

if (cmd === 'show') {
  const from = Number(a ?? 1);
  const to = Number(b ?? from + 9);
  for (const l of loadCurriculum().lessons) {
    if (l.n < from || l.n > to) continue;
    console.log(
      `L${l.n} ${l.kind}${l.newItem.grammarId ? ` [${l.newItem.grammarId}]` : ''} ${l.title} (${l.words.length})`,
    );
    for (const id of l.words) console.log(`  ${describe(id)}`);
  }
} else if (cmd === 'unassigned') {
  const curriculum = loadCurriculum();
  const taught = lessonOfWord(curriculum);
  const readableIdx = args.indexOf('--readable');
  const known =
    readableIdx >= 0
      ? kanaKnownAt(curriculum, Number(args[readableIdx + 1] ?? KANA_PHASE_END))
      : null;
  const posFilter = a && a !== '--readable' ? new RegExp(a) : null;
  const rows = vocab.filter(
    (w) =>
      !taught.has(w.id) &&
      (!posFilter || (w.pos ?? []).some((p) => posFilter.test(p))) &&
      unreadable(w, known).length === 0,
  );
  for (const w of rows) console.log(describe(w.id));
  console.log(`${rows.length} word(s)`);
} else if (cmd === 'set' && a) {
  const ids = (b ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  process.exitCode = (await setWords(Number(a), ids)) ? 0 : 1;
} else if (cmd === 'move' && a && b) {
  const curriculum = loadCurriculum();
  const from = curriculum.lessons.find((l) => l.words.includes(a));
  const to = curriculum.lessons.find((l) => l.n === Number(b));
  if (!to || !byId.has(a)) {
    console.error('usage: move <id> <lesson> (unknown id or lesson)');
    process.exitCode = 1;
  } else {
    if (from) from.words = from.words.filter((w) => w !== a);
    const ids = [...to.words.filter((w) => w !== a), a];
    const problems = problemsFor(curriculum, to, ids);
    if (problems.length) {
      console.error(`not moved:\n  ${problems.join('\n  ')}`);
      process.exitCode = 1;
    } else {
      to.words = ids;
      await writeJson(new URL('curriculum.json', content), curriculum);
      console.log(`moved ${a}: L${from?.n ?? '-'} -> L${to.n}`);
    }
  }
} else if (cmd === 'stats') {
  const curriculum = loadCurriculum();
  const taught = lessonOfWord(curriculum);
  const line = curriculum.lessons
    .filter((l) => l.kind !== 'test')
    .map((l) => `${l.n}:${l.words.length}`)
    .join(' ');
  console.log(line);
  console.log(
    `${taught.size} of ${vocab.length} words assigned, ${vocab.length - taught.size} left.`,
  );
} else {
  console.log(
    'usage: show [from] [to] | unassigned [posRegex] [--readable <lesson>] | set <lesson> <ids> | move <id> <lesson> | stats',
  );
}
