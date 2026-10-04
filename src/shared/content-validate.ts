/**
 * Cross-file content validation. Pure: takes raw parsed JSON (unknown) per file
 * and returns errors and warnings. A file that does not exist yet is passed as
 * `undefined`; checks that depend on it are skipped with a warning, so content
 * can arrive phase by phase. Once a file exists, every reference into it is
 * enforced and the build fails on any error.
 */
import type { z } from 'zod';
import {
  Curriculum,
  GlossFile,
  GrammarFile,
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

  // Sentences attached to a word may only use words taught up to that word's lesson.
  if (sentences) {
    const sentenceById = new Map(sentences.sentences.map((s) => [s.id, s]));
    for (const word of vocab.words) {
      const lesson = lessonOfWord.get(word.id);
      if (lesson === undefined) continue;
      for (const sid of word.sentences ?? []) {
        const s = sentenceById.get(sid);
        if (!s) {
          errors.push(`vocab.json: word "${word.id}" references missing sentence ${sid}`);
          continue;
        }
        if (!s.pl)
          errors.push(
            `sentences.json: sentence ${sid} (lesson ${lesson}) has no Polish translation`,
          );
        const allowed = new Set(s.allowUnknown ?? []);
        for (const used of s.words) {
          const taughtIn = lessonOfWord.get(used);
          if (allowed.has(used)) continue;
          if (taughtIn === undefined || taughtIn > lesson) {
            errors.push(
              `sentences.json: sentence ${sid} (shown in lesson ${lesson}) uses "${used}" which is ${
                taughtIn === undefined ? 'never taught' : `taught later (lesson ${taughtIn})`
              }`,
            );
          }
        }
      }
    }
  } else if ([...vocabById.values()].some((w) => w.sentences?.length)) {
    errors.push('sentences.json missing but vocab.json references sentences');
  }

  return { errors, warnings };
}
