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
 *   node scripts/examples-tool.ts validate <part.json> <fromLesson> <toLesson>
 *     Validates one parts file (content/examples/part-K.json) with the same rules as
 *     scripts/validate-content.ts, and lists words of lessons <from>..<to> without an example.
 */
import { existsSync, readFileSync } from 'node:fs';
import { KANA_PHASE_END } from '../src/shared/constants.ts';
import { ExampleFile } from '../src/shared/content-schema.ts';
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

export function contextFor(lessonN: number, allowSurfaces?: ReadonlySet<string>): CheckContext {
  return { lessonN, gates, lessonOfWord, posOfWord, allowSurfaces };
}

export function checkSentence(lessonN: number, text: string, allow?: ReadonlySet<string>) {
  const tokens = tokenize(text, lexicon);
  return { tokens, ...checkTokens(tokens, contextFor(lessonN, allow)) };
}

const HAS_KANJI = /[\u3400-\u9fff々]/;

function validatePart(path: string, from: number, to: number): string[] {
  const parsed = ExampleFile.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  const problems: string[] = [];
  const seen = new Set<string>();
  parsed.data.examples.forEach((ex, i) => {
    const where = `#${i} ${ex.wordId} (L${ex.lesson})`;
    const taughtIn = lessonOfWord.get(ex.wordId);
    if (taughtIn === undefined) {
      problems.push(`${where}: word is not taught in any lesson`);
      return;
    }
    if (ex.lesson !== taughtIn) problems.push(`${where}: the word is taught in lesson ${taughtIn}`);
    if (ex.lesson < from || ex.lesson > to) problems.push(`${where}: outside L${from}-L${to}`);
    if (seen.has(ex.wordId)) problems.push(`${where}: second example for the word`);
    seen.add(ex.wordId);
    if (ex.source === 'tatoeba' && ex.tatoebaId === undefined)
      problems.push(`${where}: Tatoeba sentence without tatoebaId`);
    if (HAS_KANJI.test(ex.ja) && !ex.kana) problems.push(`${where}: has kanji but no kana`);
    if (ex.kana && /[\u3400-\u9fffa-zA-Z]/.test(ex.kana))
      problems.push(`${where}: kana reading contains kanji or Latin letters`);
    const allow = new Set(ex.allowUnknown ?? []);
    const r = checkSentence(ex.lesson, ex.ja, allow);
    for (const p of r.problems) problems.push(`${where}: ${p} in "${ex.ja}"`);
    if (r.ok && !r.wordIds.includes(ex.wordId))
      problems.push(`${where}: the sentence does not use the word ("${ex.ja}")`);
    if (ex.kana)
      for (const p of readingProblems(r.tokens, tokenize(ex.kana, lexicon), allow))
        problems.push(`${where}: ${p} ("${ex.ja}" / "${ex.kana}")`);
  });
  for (const l of curriculum.lessons) {
    if (l.n < from || l.n > to || l.n <= KANA_PHASE_END) continue;
    for (const w of l.words) if (!seen.has(w)) problems.push(`L${l.n}: no example for "${w}"`);
  }
  return problems;
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
} else if (cmd === 'validate' && a && b && c) {
  const problems = validatePart(a, Number(b), Number(c));
  console.log(problems.length ? problems.join('\n') : `${a}: OK for L${b}-L${c}`);
  process.exitCode = problems.length ? 1 : 0;
} else {
  console.log(
    'usage: check <lesson> "<sentence>" ["<kana>"] | candidates <wordId> [limit] | lesson <n> | validate <part.json> <from> <to>',
  );
}
