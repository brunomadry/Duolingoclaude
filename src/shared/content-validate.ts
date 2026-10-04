/**
 * Cross-file content validation. Pure: takes raw parsed JSON (unknown) per file
 * and returns errors and warnings. A file that does not exist yet is passed as
 * `undefined`; checks that depend on it are skipped with a warning, so content
 * can arrive phase by phase. Once a file exists, every reference into it is
 * enforced and the build fails on any error.
 */
import type { z } from 'zod';
import { KANA_PHASE_END, MAX_WORDS_PER_LESSON } from './constants.ts';
import {
  FORM_GATES,
  GRAMMAR_KEY_GATES,
  checkTokens,
  createGates,
  readingProblems,
} from './grammar-gates.ts';
import { createLexicon, tokenize } from './jp-words.ts';
import {
  Curriculum,
  GlossFile,
  GrammarFile,
  ExampleFile,
  KanaFile,
  KanjiFile,
  SentenceFile,
  SourcesFile,
  StrokesFile,
  VocabFile,
  curriculumStructureErrors,
} from './content-schema.ts';

export interface RawContent {
  curriculum: unknown;
  sources: unknown;
  kana?: unknown;
  vocab?: unknown;
  glosses?: unknown;
  sentences?: unknown;
  grammar?: unknown;
  strokes?: unknown;
  kanji?: unknown;
  examples?: unknown;
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

function parse<T extends z.ZodType>(
  schema: T,
  data: unknown,
  file: string,
  errors: string[],
): z.infer<T> | undefined {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  for (const issue of result.error.issues.slice(0, 20)) {
    errors.push(`${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return undefined;
}

export function validateContent(raw: RawContent): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const curriculum = parse(Curriculum, raw.curriculum, 'curriculum.json', errors);
  parse(SourcesFile, raw.sources, 'SOURCES.json', errors);
  const kana = raw.kana === undefined ? undefined : parse(KanaFile, raw.kana, 'kana.json', errors);
  const vocab =
    raw.vocab === undefined ? undefined : parse(VocabFile, raw.vocab, 'vocab.json', errors);
  const glosses =
    raw.glosses === undefined
      ? undefined
      : parse(GlossFile, raw.glosses, 'glosses.pl.json', errors);
  const sentences =
    raw.sentences === undefined
      ? undefined
      : parse(SentenceFile, raw.sentences, 'sentences.json', errors);
  const grammar =
    raw.grammar === undefined ? undefined : parse(GrammarFile, raw.grammar, 'grammar.json', errors);
  const strokes =
    raw.strokes === undefined ? undefined : parse(StrokesFile, raw.strokes, 'strokes.json', errors);
  if (raw.kanji !== undefined) parse(KanjiFile, raw.kanji, 'kanji.json', errors);
  const examples =
    raw.examples === undefined
      ? undefined
      : parse(ExampleFile, raw.examples, 'examples.json', errors);

  if (!curriculum) return { errors, warnings };
  errors.push(...curriculumStructureErrors(curriculum).map((e) => `curriculum.json: ${e}`));

  // Kana groups referenced by kana lessons.
  const kanaLessons = curriculum.lessons.filter((l) => l.newItem.type === 'kana');
  if (!kana) {
    if (kanaLessons.length) warnings.push('kana.json missing: kana group references not checked');
  } else {
    const groupIds = new Set(kana.groups.map((g) => g.id));
    if (groupIds.size !== kana.groups.length) errors.push('kana.json: duplicate group ids');
    // Every kana group needs Hepburn romaji (schema) and, once strokes.json exists,
    // stroke data for each single character of the basic and dakuten groups.
    if (strokes) {
      for (const g of kana.groups) {
        if (g.kind !== 'basic' && g.kind !== 'dakuten') continue;
        for (const c of g.chars) {
          for (const ch of [...c.char]) {
            if (!strokes.chars[ch])
              errors.push(`strokes.json: missing stroke data for "${ch}" (group ${g.id})`);
          }
        }
      }
    } else {
      warnings.push('strokes.json missing: stroke order not checked');
    }
    for (const l of kanaLessons) {
      if (l.newItem.type !== 'kana') continue;
      for (const g of l.newItem.groups) {
        if (!groupIds.has(g))
          errors.push(`curriculum.json: lesson ${l.n} references missing kana group "${g}"`);
      }
    }
  }

  // Grammar notes referenced by grammar lessons.
  const grammarLessons = curriculum.lessons.filter((l) => l.newItem.type === 'grammar');
  if (!grammar) {
    if (grammarLessons.length)
      warnings.push('grammar.json missing: grammar references not checked');
  } else {
    const noteIds = new Set(grammar.notes.map((n) => n.id));
    for (const l of grammarLessons) {
      if (l.newItem.type !== 'grammar') continue;
      if (!noteIds.has(l.newItem.grammarId)) {
        errors.push(
          `curriculum.json: lesson ${l.n} references missing grammar note "${l.newItem.grammarId}"`,
        );
      }
    }
    const unreviewed = grammar.notes.filter((n) => !n.reviewed).length;
    if (unreviewed)
      warnings.push(`grammar.json: ${unreviewed} note(s) not yet reviewed by the user`);
  }

  // Vocabulary: every word a lesson introduces must exist, be introduced once, and have a Polish gloss.
  const lessonOfWord = new Map<string, number>();
  for (const l of curriculum.lessons) {
    for (const w of l.words) {
      if (lessonOfWord.has(w))
        errors.push(
          `curriculum.json: word "${w}" introduced twice (lesson ${lessonOfWord.get(w)} and ${l.n})`,
        );
      else lessonOfWord.set(w, l.n);
    }
  }
  if (!vocab) {
    if (lessonOfWord.size) warnings.push('vocab.json missing: word references not checked');
    return { errors, warnings };
  }

  const vocabById = new Map(vocab.words.map((w) => [w.id, w]));

  // Lesson load: at most MAX_WORDS_PER_LESSON new words, none in tests.
  for (const l of curriculum.lessons) {
    if (l.words.length > MAX_WORDS_PER_LESSON) {
      errors.push(
        `curriculum.json: lesson ${l.n} introduces ${l.words.length} words (max ${MAX_WORDS_PER_LESSON})`,
      );
    }
    if (l.kind === 'test' && l.words.length)
      errors.push(`curriculum.json: test lesson ${l.n} must not introduce words`);
  }

  // Writing phase: a word may only use kana already taught (it is shown in kana only).
  if (kana) {
    const learned = new Set<string>(['ー']);
    const groupChars = new Map(kana.groups.map((g) => [g.id, g.chars.flatMap((c) => [...c.char])]));
    for (const l of curriculum.lessons) {
      if (l.n > KANA_PHASE_END) break;
      if (l.newItem.type === 'kana')
        for (const g of l.newItem.groups) for (const ch of groupChars.get(g) ?? []) learned.add(ch);
      for (const w of l.words) {
        const entry = vocabById.get(w);
        if (!entry) continue;
        const missing = [...entry.kana].filter((ch) => !learned.has(ch));
        if (missing.length) {
          errors.push(
            `curriculum.json: lesson ${l.n} word "${w}" (${entry.kana}) uses kana not taught yet: ${[...new Set(missing)].join('')}`,
          );
        }
      }
    }
  }
  if (vocabById.size !== vocab.words.length) errors.push('vocab.json: duplicate word ids');
  for (const [w, n] of lessonOfWord) {
    if (!vocabById.has(w))
      errors.push(`curriculum.json: lesson ${n} references missing word "${w}"`);
  }

  if (!glosses) {
    if (lessonOfWord.size)
      errors.push('glosses.pl.json missing: every taught word needs a Polish gloss');
  } else {
    for (const [w, n] of lessonOfWord) {
      if (!glosses.glosses[w])
        errors.push(`glosses.pl.json: word "${w}" (lesson ${n}) has no Polish gloss`);
    }
  }

  // The Tatoeba corpus is raw material: only check that referenced ids exist.
  if (sentences) {
    const sentenceIds = new Set(sentences.sentences.map((s) => s.id));
    for (const word of vocab.words) {
      for (const sid of word.sentences ?? []) {
        if (!sentenceIds.has(sid))
          errors.push(`vocab.json: word "${word.id}" references missing sentence ${sid}`);
      }
    }
  }

  const lexicon = createLexicon(vocab.words.map((w) => ({ ...w, pos: w.pos ?? [] })));
  const gates = createGates(curriculum);
  const posOfWord = new Map(vocab.words.map((w) => [w.id, w.pos ?? []]));

  // Grammar note examples: only words and grammar taught by the note's own lesson.
  if (grammar) {
    for (const note of grammar.notes) {
      const lessonN = gates.lessonOfGrammar(note.id);
      if (lessonN === null) {
        errors.push(`grammar.json: note "${note.id}" is not taught by any lesson`);
        continue;
      }
      const lessonWords = new Set(
        curriculum.lessons
          .filter((l) => l.n === lessonN || l.n === lessonN + 1)
          .flatMap((l) => l.words),
      );
      note.examples.forEach((ex, i) => {
        const where = `grammar.json ${note.id} example ${i + 1} (lesson ${lessonN})`;
        for (const p of sentenceProblems(ex, lessonN, { lexicon, gates, lessonOfWord, posOfWord }))
          errors.push(`${where}: ${p}`);
        const check = checkTokens(tokenize(ex.ja, lexicon), {
          lessonN,
          gates,
          lessonOfWord,
          posOfWord,
        });
        const usesPoint =
          usedGrammar(tokenize(ex.ja, lexicon), posOfWord).has(note.id) ||
          check.wordIds.some((w) => lessonWords.has(w));
        if (check.ok && !usesPoint)
          warnings.push(`${where}: does not seem to use "${note.id}" ("${ex.ja}")`);
      });
    }
  }

  // Lesson examples: every word taught after the writing phase needs one, and each must only
  // use words and grammar its lesson has taught (checked with the real word matcher).
  if (!examples) {
    if ([...lessonOfWord.values()].some((n) => n > KANA_PHASE_END)) {
      warnings.push('examples.json missing: lesson example sentences not checked');
    }
    return { errors, warnings };
  }
  const exampled = new Set<string>();
  examples.examples.forEach((ex, i) => {
    const where = `examples.json #${i} (${ex.wordId}, lesson ${ex.lesson})`;
    const taughtIn = lessonOfWord.get(ex.wordId);
    if (taughtIn === undefined) {
      errors.push(`${where}: word is not taught in any lesson`);
      return;
    }
    if (ex.lesson < taughtIn)
      errors.push(`${where}: shown before the word is taught (lesson ${taughtIn})`);
    if (ex.lesson === taughtIn) exampled.add(ex.wordId);
    if (/[\u3400-\u9fff々]/.test(ex.ja) && !ex.kana)
      errors.push(`${where}: has kanji but no kana reading`);
    if (ex.kana && /[\u3400-\u9fffa-zA-Z]/.test(ex.kana))
      errors.push(`${where}: kana reading contains kanji or Latin letters`);
    const allowSurfaces = new Set(ex.allowUnknown ?? []);
    const written = tokenize(ex.ja, lexicon);
    const result = checkTokens(written, {
      lessonN: ex.lesson,
      gates,
      lessonOfWord,
      posOfWord,
      allowSurfaces,
    });
    for (const p of result.problems) errors.push(`${where}: ${p} in "${ex.ja}"`);
    if (ex.kana) {
      for (const p of readingProblems(written, tokenize(ex.kana, lexicon), allowSurfaces))
        errors.push(`${where}: ${p} ("${ex.ja}" / "${ex.kana}")`);
    }
    if (result.ok && !result.wordIds.includes(ex.wordId))
      errors.push(`${where}: the sentence does not use the word ("${ex.ja}")`);
  });
  for (const [w, n] of lessonOfWord) {
    if (n > KANA_PHASE_END && !exampled.has(w))
      errors.push(`examples.json: word "${w}" (lesson ${n}) has no example sentence`);
  }

  return { errors, warnings };
}

interface SentenceDeps {
  lexicon: ReturnType<typeof createLexicon>;
  gates: ReturnType<typeof createGates>;
  lessonOfWord: ReadonlyMap<string, number>;
  posOfWord: ReadonlyMap<string, readonly string[]>;
}

/** Problems of one sentence shown at a lesson: unknown words or grammar, a missing or wrong reading. */
export function sentenceProblems(
  ex: { ja: string; kana?: string; allowUnknown?: string[] },
  lessonN: number,
  deps: SentenceDeps,
): string[] {
  const problems: string[] = [];
  if (/[\u3400-\u9fff々]/.test(ex.ja) && !ex.kana) problems.push('has kanji but no kana reading');
  if (ex.kana && /[\u3400-\u9fffa-zA-Z]/.test(ex.kana))
    problems.push('kana reading contains kanji or Latin letters');
  const allowSurfaces = new Set(ex.allowUnknown ?? []);
  const written = tokenize(ex.ja, deps.lexicon);
  const result = checkTokens(written, { lessonN, ...deps, allowSurfaces });
  for (const p of result.problems) problems.push(`${p} in "${ex.ja}"`);
  if (ex.kana) {
    for (const p of readingProblems(written, tokenize(ex.kana, deps.lexicon), allowSurfaces))
      problems.push(`${p} ("${ex.ja}" / "${ex.kana}")`);
  }
  return problems;
}

const VERB_POS = /^v(?:1|5|k|s-i|z)/;

/** Grammar ids a tokenized sentence uses (function words and inflections). */
export function usedGrammar(
  tokens: ReturnType<typeof tokenize>,
  posOfWord: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const used = new Set<string>();
  for (const t of tokens) {
    if (t.kind === 'grammar' && t.grammar) {
      const id = GRAMMAR_KEY_GATES[t.grammar];
      if (id) used.add(id);
    }
    if (t.kind === 'word' && t.wordIds[0]) {
      const verb = (posOfWord.get(t.wordIds[0]) ?? []).some((p) => VERB_POS.test(p));
      const form = t.form ?? (verb ? 'dict' : undefined);
      const id = form ? FORM_GATES[form] : null;
      if (id) used.add(id);
    }
  }
  return used;
}
