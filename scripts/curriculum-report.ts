/**
 * Writes docs/curriculum-words.md: every lesson with its new words (kana, kanji, romaji,
 * Polish gloss) and kanji, then the bonus words no lesson teaches, for a human to read
 * through. Deterministic, so rerunning it only changes the file when the content changed.
 * Usage: node scripts/curriculum-report.ts
 */
import { readFileSync } from 'node:fs';
import { lessonKanji } from '../src/lesson/kanji.ts';
import { MAX_WORDS_PER_LESSON } from '../src/shared/constants.ts';
import { writeFormatted } from './write-formatted.ts';

const content = new URL('../content/', import.meta.url);
const read = <T>(file: string): T => JSON.parse(readFileSync(new URL(file, content), 'utf8')) as T;

interface Word {
  id: string;
  kana: string;
  kanji?: string;
  romaji: string;
  en: string[];
}
interface Lesson {
  n: number;
  kind: string;
  title: string;
  words: string[];
  kanji?: string[];
  newItem: { type: string; kanji?: string[] };
}

const vocab = read<{ words: Word[] }>('vocab.json').words;
const byId = new Map(vocab.map((w) => [w.id, w]));
const glosses = read<{ glosses: Record<string, { pl: string[] }> }>('glosses.pl.json').glosses;
const kanjiPl = read<{ kanji: Record<string, { pl: string[] }> }>('kanji.pl.json').kanji;
const lessons = read<{ lessons: Lesson[] }>('curriculum.json').lessons;

const KIND_LABELS: Readonly<Record<string, string>> = {
  kana: 'kana',
  grammar: 'gramatyka',
  practice: 'ćwiczenia',
  kanji: 'kanji',
  test: 'test',
  review: 'powtórka',
};

const cell = (text: string) => text.replace(/\|/g, '\\|');
const gloss = (w: Word) => cell(glosses[w.id]?.pl.join('; ') ?? '**BRAK**');
const wordRow = (w: Word) => `| ${w.kana} | ${w.kanji ?? ''} | ${w.romaji} | ${gloss(w)} |`;
const WORD_TABLE_HEAD = '| Kana | Kanji | Romaji | Polski |\n| --- | --- | --- | --- |';

function wordsOf(lesson: Lesson): Word[] {
  return lesson.words.map((id) => {
    const w = byId.get(id);
    if (!w) throw new Error(`Lesson ${lesson.n}: unknown word ${id}`);
    return w;
  });
}

const taught = new Set(lessons.flatMap((l) => l.words));
const bonus = vocab
  .filter((w) => !taught.has(w.id))
  .sort((a, b) => a.kana.localeCompare(b.kana, 'ja') || a.id.localeCompare(b.id));
const lessonsWithWords = lessons.filter((l) => l.words.length > 0);
const allKanji = lessons.flatMap((l) => lessonKanji(l));
const firstKanjiLesson = lessons.find((l) => lessonKanji(l).length > 0)?.n;

const overview = lessons.map((l) => {
  const kanji = lessonKanji(l).join(' ');
  return `| ${l.n} | ${KIND_LABELS[l.kind] ?? l.kind} | ${cell(l.title)} | ${l.words.length || ''} | ${kanji} |`;
});

const sections = lessons
  .filter((l) => l.words.length > 0 || lessonKanji(l).length > 0)
  .map((l) => {
    const parts = [`### L${l.n}: ${l.title}`];
    if (l.words.length) parts.push(`${WORD_TABLE_HEAD}\n${wordsOf(l).map(wordRow).join('\n')}`);
    const kanji = lessonKanji(l).map((ch) => `- ${ch}: ${kanjiPl[ch]?.pl[0] ?? '**BRAK**'}`);
    if (kanji.length) parts.push(`Kanji:\n\n${kanji.join('\n')}`);
    return parts.join('\n\n');
  });

const doc = `# Słówka w lekcjach

Ten plik generuje \`node scripts/curriculum-report.ts\` z plików w \`content/\`. Nie poprawiaj go
ręcznie: zmień dane (na przykład \`node scripts/curriculum-tool.ts move <id> <lekcja>\`) i uruchom
skrypt jeszcze raz.

Polskie znaczenia napisał model językowy i mają flagę \`reviewed: false\`. Jeśli coś się nie
zgadza (znaczenie albo lekcja, w której słówko się pojawia), daj znać albo popraw
\`content/glosses.pl.json\`.

## Podsumowanie

- Słówka w lekcjach: ${taught.size}, w ${lessonsWithWords.length} lekcjach (najwyżej ${MAX_WORDS_PER_LESSON} na lekcję).
- Słówka dodatkowe, spoza lekcji: ${bonus.length}. Są w słowniku N5 w zakładce Słówka, ale nie trafiają do powtórek.
- Wszystkie słówka N5 w kursie: ${vocab.length}.
- Kanji: ${allKanji.length}${firstKanjiLesson ? `, od lekcji ${firstKanjiLesson}` : ''}.

## Lekcje

| Lekcja | Rodzaj | Temat | Słówka | Kanji |
| --- | --- | --- | --- | --- |
${overview.join('\n')}

## Słówka i kanji po lekcjach

${sections.join('\n\n')}

## Słówka dodatkowe

Słówka z listy N5, których żadna lekcja nie uczy, w kolejności kana.

${WORD_TABLE_HEAD}
${bonus.map(wordRow).join('\n')}
`;

await writeFormatted(new URL('../docs/curriculum-words.md', import.meta.url), doc);
console.log(
  `Wrote docs/curriculum-words.md (${taught.size} lesson words, ${bonus.length} bonus words, ${allKanji.length} kanji)`,
);
