/**
 * Helper for writing lesson example sentences.
 *
 *   node scripts/examples-tool.ts check <lesson> "<japanese sentence>" ["<kana reading>"]
 *     Tokenizes the sentence and checks it against what lesson <lesson> has taught
 *     (words via content/curriculum.json, grammar via src/shared/grammar-gates.ts), and
 *     that the kana reading, if given, spells the same words.
 *   node scripts/examples-tool.ts candidates <wordId> [limit]
 *     Lists Tatoeba sentences from content/sentences.json that use the word and pass the
 *     check at the word's lesson, shortest first.
 *   node scripts/examples-tool.ts lesson <n>
 *     Shows what lesson <n> teaches and which of its words still lack an example.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createLexicon, tokenize, type LexEntry } from '../src/shared/jp-words.ts';
import {
  checkTokens,
  createGates,
  readingProblems,
  type CheckContext,
} from '../src/shared/grammar-gates.ts';

const content = new URL('../content/', import.meta.url);
const read = <T>(file: string): T => JSON.parse(readFileSync(new URL(file, content), 'utf8')) as T;

interface Word extends LexEntry {
  romaji: string;
}
interface CurriculumJson {
  lessons: {
    n: number;
    kind: string;
    title: string;
    words: string[];
    newItem: { type: string; grammarId?: string };
  }[];
}
interface SentenceJson {
  id: number;
  ja: string;
  en: string;
}

const curriculum = read<CurriculumJson>('curriculum.json');
const vocab = read<{ words: Word[] }>('vocab.json').words;
const lexicon = createLexicon(vocab);
const gates = createGates(curriculum);
const lessonOfWord = new Map<string, number>();
for (const l of curriculum.lessons) for (const w of l.words) lessonOfWord.set(w, l.n);
const posOfWord = new Map(vocab.map((w) => [w.id, w.pos]));

export function contextFor(lessonN: number): CheckContext {
  return { lessonN, gates, lessonOfWord, posOfWord };
}

export function checkSentence(lessonN: number, text: string) {
  const tokens = tokenize(text, lexicon);
  return { tokens, ...checkTokens(tokens, contextFor(lessonN)) };
}

function show(tokens: ReturnType<typeof tokenize>): string {
  return tokens
    .map((t) =>
      t.kind === 'word'
        ? `${t.surface}[${t.wordIds.join('/')}]`
        : t.kind === 'unknown'
          ? `?${t.surface}?`
          : t.surface,
    )
    .join(' ');
}

const [cmd, a, b, c] = process.argv.slice(2);

if (cmd === 'check' && a && b) {
  const r = checkSentence(Number(a), b);
  console.log(show(r.tokens));
  console.log(
    r.ok
      ? `OK at lesson ${a}; words: ${r.wordIds.join(', ')}`
      : `NOT OK at lesson ${a}:\n  ${r.problems.join('\n  ')}`,
  );
  let readingOk = true;
  if (c) {
    const reading = tokenize(c, lexicon);
    const problems = readingProblems(r.tokens, reading);
    readingOk = problems.length === 0;
    console.log(show(reading));
    console.log(readingOk ? 'reading OK' : `READING NOT OK:\n  ${problems.join('\n  ')}`);
  }
  process.exitCode = r.ok && readingOk ? 0 : 1;
} else if (cmd === 'candidates' && a) {
  const lesson = lessonOfWord.get(a);
  if (lesson === undefined) {
    console.error(`"${a}" is not assigned to a lesson`);
    process.exit(1);
  }
  const limit = Number(b ?? 5);
  const found = read<{ sentences: SentenceJson[] }>('sentences.json')
    .sentences.map((s) => ({ s, r: checkSentence(lesson, s.ja) }))
    .filter(({ r }) => r.ok && r.wordIds.includes(a))
    .sort((x, y) => x.s.ja.length - y.s.ja.length)
    .slice(0, limit);
  if (!found.length) console.log(`No Tatoeba sentence for "${a}" passes at lesson ${lesson}.`);
  for (const { s } of found) console.log(`${s.id}\t${s.ja}\t${s.en}`);
} else if (cmd === 'lesson' && a) {
  const n = Number(a);
  const l = curriculum.lessons[n - 1];
  if (!l) process.exit(1);
  const done = existsSync(new URL('examples.json', content))
    ? new Set(
        read<{ examples: { wordId: string }[] }>('examples.json').examples.map((e) => e.wordId),
      )
    : new Set<string>();
  console.log(
    `L${n} ${l.kind} ${l.title}${l.newItem.grammarId ? ` (${l.newItem.grammarId})` : ''}`,
  );
  for (const w of l.words) {
    const v = vocab.find((x) => x.id === w);
    console.log(`  ${done.has(w) ? 'ok ' : '...'} ${w}\t${v?.kanji ?? ''} ${v?.kana ?? ''}`);
  }
} else {
  console.log(
    'usage: check <lesson> "<sentence>" ["<kana>"] | candidates <wordId> [limit] | lesson <n>',
  );
}
