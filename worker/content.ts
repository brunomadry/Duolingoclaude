/**
 * Course content bundled into the Worker for the AI validator: the curriculum and the
 * vocabulary, turned (once per isolate) into the word matcher, the grammar gates and the
 * per-lesson whitelist sent to the model.
 */
import curriculumData from '../content/curriculum.json';
import vocabData from '../content/vocab.json';
import type { AiLessonContext, AiWord, ValidatorDeps } from '../src/shared/ai.ts';
import { createGates } from '../src/shared/grammar-gates.ts';
import { createLexicon } from '../src/shared/jp-words.ts';

interface LessonJson {
  n: number;
  words: string[];
  newItem: { type: string; grammarId?: string };
}

const lessons = (curriculumData as { lessons: LessonJson[] }).lessons;
const vocab = vocabData.words as {
  id: string;
  kana: string;
  kanji?: string;
  en: string[];
  pos?: string[];
}[];

let deps: ValidatorDeps | null = null;

export function validatorDeps(): ValidatorDeps {
  if (!deps) {
    const lessonOfWord = new Map<string, number>();
    for (const l of lessons) for (const w of l.words) lessonOfWord.set(w, l.n);
    deps = {
      lexicon: createLexicon(vocab.map((w) => ({ ...w, pos: w.pos ?? [] }))),
      gates: createGates({ lessons }),
      lessonOfWord,
      posOfWord: new Map(vocab.map((w) => [w.id, w.pos ?? []])),
    };
  }
  return deps;
}

const byId = new Map(vocab.map((w) => [w.id, w]));

function aiWord(id: string): AiWord | null {
  const w = byId.get(id);
  return w ? { written: w.kanji ?? w.kana, kana: w.kana, en: w.en.slice(0, 2).join(', ') } : null;
}

/** What the model may use at lesson n, or null for lessons without sentences. */
export function lessonContext(n: number): AiLessonContext | null {
  const lesson = lessons[n - 1];
  if (!lesson) return null;
  const taught = lessons.filter((l) => l.n <= n);
  const grammar = taught.flatMap((l) =>
    l.newItem.type === 'grammar' && l.newItem.grammarId ? [l.newItem.grammarId] : [],
  );
  if (!grammar.length) return null;
  const words = taught.flatMap((l) => l.words.map(aiWord)).filter((w): w is AiWord => !!w);
  // Practice lessons and tests use the newest words of the last grammar point.
  const recent = [...taught].reverse().find((l) => l.words.length);
  const newWords = (lesson.words.length ? lesson.words : (recent?.words ?? []))
    .map(aiWord)
    .filter((w): w is AiWord => !!w);
  return { lessonN: n, words, newWords, grammar, focus: grammar.at(-1) ?? null };
}

/** Changes whenever the words taught by lesson n change, so cached sets go stale. */
export async function whitelistHash(n: number): Promise<string> {
  const ids = lessons
    .filter((l) => l.n <= n)
    .flatMap((l) => l.words)
    .join(',');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ids));
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
