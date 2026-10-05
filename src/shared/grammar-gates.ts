/**
 * Which grammar a sentence may use at a given lesson. Function words (GRAMMAR_WORDS keys
 * from src/shared/jp-words.ts) and inflected forms are each tied to the grammar point that
 * teaches them; the lesson of that grammar point comes from the curriculum. Used by the
 * content pipeline (example sentences) and later by the AI output validator.
 *
 * `null` means "not taught in this N5 course": a sentence using it is above level.
 * Pure: the curriculum and the word-to-lesson map are passed in, so this runs in the
 * browser, the Worker and Node scripts alike.
 */
import type { InflectionForm, Lexicon, Token } from './jp-words.ts';

/** Grammar id (content/curriculum.json newItem.grammarId) per GRAMMAR_WORDS key. */
export const GRAMMAR_KEY_GATES: Readonly<Record<string, string | null>> = {
  // Introduced with the very first sentences.
  wa: 'wa-desu',
  desu: 'wa-desu',
  yo: 'wa-desu',
  ne: 'wa-desu',
  yone: 'wa-desu',
  'o-prefix': 'wa-desu',
  'go-prefix': 'wa-desu',
  san: 'wa-desu',
  chan: 'wa-desu',
  kun: 'wa-desu',
  sama: 'wa-desu',
  // Questions and the polite negative of the copula.
  ka: 'ka-question',
  sou: 'ka-question',
  'ja-arimasen': 'ka-question',
  'dewa-arimasen': 'ka-question',
  'ja-nai': 'ka-question',
  'dewa-nai': 'ka-question',
  // Linking nouns.
  no: 'no-mo',
  mo: 'no-mo',
  to: 'no-mo',
  ya: 'no-mo',
  tachi: 'no-mo',
  // Verbs and objects.
  wo: 'masu-wo',
  masu: 'masu-wo',
  // Time, destination, from/to.
  ni: 'ni-he',
  e: 'ni-he',
  kara: 'ni-he',
  made: 'ni-he',
  de: 'de-place-means',
  // Past and negative.
  masen: 'masen-mashita',
  mashita: 'masen-mashita',
  'masen-deshita': 'masen-mashita',
  deshita: 'masen-mashita',
  'ja-arimasen-deshita': 'masen-mashita',
  'dewa-arimasen-deshita': 'masen-mashita',
  // Adjectives (が for likes and skills comes with 好き/上手).
  na: 'na-adjectives',
  ga: 'na-adjectives',
  gozaimasu: 'arimasu-imasu',
  // Numbers, time and counters.
  ji: 'numbers-time',
  fun: 'numbers-time',
  byou: 'numbers-time',
  goro: 'numbers-time',
  nichi: 'counters',
  gatsu: 'counters',
  youbi: 'counters',
  nen: 'counters',
  shuukan: 'counters',
  kagetsu: 'counters',
  en: 'counters',
  nin: 'counters',
  sai: 'counters',
  tsu: 'counters',
  ko: 'counters',
  hon: 'counters',
  mai: 'counters',
  satsu: 'counters',
  hiki: 'counters',
  dai: 'counters',
  kai: 'counters',
  'kai-floor': 'counters',
  hai: 'counters',
  ban: 'counters',
  do: 'counters',
  dake: 'counters',
  kurai: 'counters',
  gurai: 'counters',
  nado: 'counters',
  shika: 'counters',
  // Wishes and suggestions.
  mashou: 'tai-mashou',
  // Comparisons.
  yori: 'yori-hou',
  hou: 'yori-hou',
  // Reasons and contrast.
  'ga-but': 'kara-demo',
  demo: 'kara-demo',
  kedo: 'kara-demo',
  keredo: 'kara-demo',
  node: 'kara-demo',
  // Plain speech.
  da: 'plain-da',
  datta: 'plain-ta',
  'ja-nakatta': 'plain-nakatta',
  'dewa-nakatta': 'plain-nakatta',
  ikenai: 'plain-nai',
  koto: 'plain-dictionary',
  'ja-naku': 'adjectives-plain',
  'dewa-naku': 'adjectives-plain',
  n: 'casual-speech',
  toki: 'mae-ato',
  deshou: 'deshou',
  darou: 'deshou',
  you: 'naru',
  // Above N5 in this course.
  shimau: null,
};

/** Grammar id per inflected form of a word. */
export const FORM_GATES: Readonly<Record<InflectionForm, string | null>> = {
  dict: 'plain-dictionary',
  stem: 'ni-he',
  masu: 'masu-wo',
  mashita: 'masen-mashita',
  masen: 'masen-mashita',
  'masen-deshita': 'masen-mashita',
  mashou: 'tai-mashou',
  'mashou-ka': 'tai-mashou',
  tai: 'tai-mashou',
  takunai: 'tai-mashou',
  takatta: 'tai-mashou',
  takunakatta: 'tai-mashou',
  takute: 'adjectives-plain',
  te: 'te-form',
  ta: 'plain-ta',
  nai: 'plain-nai',
  nakatta: 'plain-nakatta',
  naku: 'plain-nai',
  nakute: 'plain-nai',
  naide: 'plain-nai',
  ku: 'i-adjectives',
  kunai: 'i-adjectives',
  katta: 'i-adjectives',
  kunakatta: 'i-adjectives',
  kute: 'adjectives-plain',
  kunakute: 'adjectives-plain',
  // N4 in this course.
  tara: null,
  tari: null,
  volitional: null,
  nagara: null,
  nasai: null,
  kattara: null,
};

const VERB_POS = /^v(?:1|5|k|s-i|z)/;

export interface GateCurriculum {
  lessons: readonly { n: number; newItem: { type: string; grammarId?: string } }[];
}

export interface Gates {
  /** Lesson where a grammar id is taught, or null if not in the course. */
  lessonOfGrammar(id: string | null): number | null;
  keyLesson(key: string): number | null;
  formLesson(form: InflectionForm): number | null;
  numbersLesson: number | null;
}

export function createGates(curriculum: GateCurriculum): Gates {
  const byId = new Map<string, number>();
  for (const l of curriculum.lessons) {
    if (l.newItem.type === 'grammar' && l.newItem.grammarId && !byId.has(l.newItem.grammarId)) {
      byId.set(l.newItem.grammarId, l.n);
    }
  }
  const lessonOfGrammar = (id: string | null) => (id === null ? null : (byId.get(id) ?? null));
  return {
    lessonOfGrammar,
    keyLesson: (key) =>
      key in GRAMMAR_KEY_GATES ? lessonOfGrammar(GRAMMAR_KEY_GATES[key] ?? null) : null,
    formLesson: (form) => lessonOfGrammar(FORM_GATES[form] ?? null),
    numbersLesson: lessonOfGrammar('numbers-time'),
  };
}

export interface CheckContext {
  lessonN: number;
  gates: Gates;
  /** Lesson where each vocabulary id is taught. */
  lessonOfWord: ReadonlyMap<string, number>;
  /** Part-of-speech tags per vocabulary id (to spot plain dictionary-form verbs). */
  posOfWord: ReadonlyMap<string, readonly string[]>;
  /** Surfaces knowingly allowed although unknown (names, flagged exceptions). */
  allowSurfaces?: ReadonlySet<string>;
}

export interface SentenceCheck {
  ok: boolean;
  /** Polish-agnostic English problem descriptions for the content report. */
  problems: string[];
  /** Vocabulary ids used (first acceptable candidate per word token). */
  wordIds: string[];
}

const okAt = (lesson: number | null, n: number) => lesson !== null && lesson <= n;

/** Checks that every token of a sentence is taught by lesson `ctx.lessonN`. */
export function checkTokens(tokens: readonly Token[], ctx: CheckContext): SentenceCheck {
  const problems: string[] = [];
  const wordIds: string[] = [];
  const n = ctx.lessonN;
  for (const t of tokens) {
    switch (t.kind) {
      case 'punct':
        break;
      case 'number':
        if (!okAt(ctx.gates.numbersLesson, n))
          problems.push(`number "${t.surface}" before numbers are taught`);
        else if (t.wordIds[0]) wordIds.push(t.wordIds[0]);
        break;
      case 'grammar': {
        const at = ctx.gates.keyLesson(t.grammar ?? '');
        if (!okAt(at, n))
          problems.push(
            `grammar "${t.surface}" (${t.grammar}) ${at === null ? 'is above N5' : `taught in lesson ${at}`}`,
          );
        break;
      }
      case 'word': {
        // Several candidates (きて: 着る or 来る): accept the sentence if any of them is taught.
        const taught = t.wordIds.filter((id) => okAt(ctx.lessonOfWord.get(id) ?? null, n));
        const alt = t.grammar ? ctx.gates.keyLesson(t.grammar) : null;
        if (!taught.length) {
          if (okAt(alt, n)) break;
          const later = t.wordIds
            .map((id) => ctx.lessonOfWord.get(id))
            .filter((x): x is number => x !== undefined);
          problems.push(
            `word "${t.surface}" ${later.length ? `taught in lesson ${Math.min(...later)}` : 'is never taught'}`,
          );
          break;
        }
        const id = taught[0] as string;
        wordIds.push(id);
        const isVerb = (ctx.posOfWord.get(id) ?? []).some((p) => VERB_POS.test(p));
        const form: InflectionForm | undefined = t.form ?? (isVerb ? 'dict' : undefined);
        if (form) {
          const at = ctx.gates.formLesson(form);
          if (!okAt(at, n)) {
            problems.push(
              `form "${t.surface}" (${form}) ${at === null ? 'is above N5' : `taught in lesson ${at}`}`,
            );
          }
        }
        break;
      }
      default:
        if (!ctx.allowSurfaces?.has(t.surface)) problems.push(`unknown "${t.surface}"`);
    }
  }
  return { ok: problems.length === 0, problems, wordIds: [...new Set(wordIds)] };
}

const NUMERAL_START = /^[〇一二三四五六七八九十百千万]/;
const numberWordCache = new WeakMap<Lexicon, ReadonlySet<string>>();

/** Words a written number may be read as: number words and words spelled with one (二人 ふたり). */
function numberWords(lexicon: Lexicon): ReadonlySet<string> {
  let ids = numberWordCache.get(lexicon);
  if (!ids) {
    ids = new Set(
      lexicon.entries
        .filter(
          (e) =>
            e.pos.includes('num') || e.pos.includes('ctr') || NUMERAL_START.test(e.kanji ?? ''),
        )
        .map((e) => e.id),
    );
    numberWordCache.set(lexicon, ids);
  }
  return ids;
}

const isCounterSurface = (lexicon: Lexicon, surface: string) =>
  lexicon.surfaces.get(surface)?.grammar.some((g) => g.role === 'counter') ?? false;

/** Do a written token and a reading token stand for the same word or grammar word? */
function sameToken(w: Token, r: Token): boolean {
  const lone = r.kind === 'unknown' && [...r.surface].length === 1;
  if (w.kind === 'word') {
    if (r.kind === 'grammar') return !!w.grammar && w.grammar === r.grammar;
    // A lone kana matches any word: single-kana words (目 め, 手 て) are not matched in kana.
    if (r.kind !== 'word') return lone;
    const shared = r.wordIds.filter((id) => w.wordIds.includes(id));
    if (!shared.length) return false;
    // Tokens carry the form of their first candidate only: compare forms when that is the
    // shared word on both sides (飲みます / のみません), otherwise trust the word (切って /
    // きって, where 切手 comes first).
    const firstOnBoth = shared.includes(w.wordIds[0] ?? '') && shared.includes(r.wordIds[0] ?? '');
    return !firstOnBoth || (w.form ?? '') === (r.form ?? '');
  }
  if (w.kind === 'grammar') {
    if (r.kind === 'grammar') return w.grammar === r.grammar;
    return r.kind === 'word' && !!r.grammar && r.grammar === w.grammar;
  }
  return w.kind === r.kind && w.surface === r.surface;
}

/**
 * Checks that a kana reading spells the written sentence token for token: the same words in
 * the same forms, the same particles and endings, nothing added or left out (でした for
 * です, を spelled お or an extra adjective are all problems). A number with its counters
 * may be read in any number of number-like tokens (三時 さんじ, 五本 ごほん, 二人 ふたり),
 * a flagged name in any tokens, and a space may split a kana word (じゃ ありません).
 * Unknown text in the reading is a problem unless knowingly allowed.
 */
export function readingProblems(
  written: readonly Token[],
  reading: readonly Token[],
  lexicon: Lexicon,
  allowSurfaces?: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const t of reading) {
    if (t.kind === 'unknown' && [...t.surface].length > 1 && !allowSurfaces?.has(t.surface))
      problems.push(`reading has unknown "${t.surface}"`);
  }
  const W = written.filter((t) => t.kind !== 'punct');
  const R = reading.filter((t) => t.kind !== 'punct');
  const numbers = numberWords(lexicon);
  const isCounter = (t: Token | undefined) =>
    t?.kind === 'grammar' && isCounterSurface(lexicon, t.surface);
  const numberLike = (r: Token) =>
    r.kind === 'number' ||
    r.kind === 'unknown' ||
    // The kana matcher splits some numbers into single-kana grammar words (に, ご, よ).
    (r.kind === 'grammar' && (isCounter(r) || [...r.surface].length === 1)) ||
    (r.kind === 'word' &&
      (r.wordIds.some((id) => numbers.has(id)) || isCounterSurface(lexicon, r.surface)));

  // match(i, j): does W[i..] spell R[j..]? Memoised; `reached` keeps the furthest point.
  const memo = new Map<number, boolean>();
  let reached = [0, 0] as [number, number];
  const match = (i: number, j: number): boolean => {
    const key = i * (R.length + 1) + j;
    const known = memo.get(key);
    if (known !== undefined) return known;
    if (i > reached[0] || (i === reached[0] && j > reached[1])) reached = [i, j];
    const w = W[i];
    let ok = false;
    if (!w) ok = j === R.length;
    else if (w.kind === 'number' || w.kind === 'unknown') {
      let next = i + 1;
      if (w.kind === 'number') while (W[next]?.kind === 'number' || isCounter(W[next])) next++;
      for (let end = j + 1; end <= R.length && !ok; end++) {
        if (w.kind === 'number' && !numberLike(R[end - 1] as Token)) break;
        ok = match(next, end);
      }
    } else {
      const r = R[j];
      ok = r !== undefined && sameToken(w, r) && match(i + 1, j + 1);
      if (!ok && /^[ぁ-ゖァ-ヺー]+$/.test(w.surface)) {
        let joined = '';
        for (let end = j; end < R.length && !ok && joined.length < w.surface.length; end++) {
          joined += R[end]?.surface ?? '';
          if (end > j && joined === w.surface) ok = match(i + 1, end + 1);
        }
      }
    }
    memo.set(key, ok);
    return ok;
  };
  if (!match(0, 0)) {
    const [i, j] = reached;
    const w = W[i];
    const r = R[j];
    problems.push(
      w
        ? `reading does not spell "${w.surface}"${r ? ` (it has "${r.surface}")` : ''}`
        : `reading has extra "${r?.surface ?? ''}"`,
    );
  }
  return problems;
}

/**
 * Grammar ids a tokenized sentence uses: function words and inflections through the gates,
 * plus patterns made of several tokens (て + いる is ～ている, て + から is ～てから, く or に
 * + なる is ～なる). A verb with no inflection is the dictionary form.
 */
export function grammarOfTokens(
  tokens: readonly Token[],
  isVerb: (wordId: string) => boolean,
): Set<string> {
  const used = new Set<string>();
  const content = tokens.filter((t) => t.kind !== 'punct' || t.surface.trim() !== '');
  content.forEach((t, i) => {
    const next = content[i + 1];
    if (t.kind === 'grammar' && t.grammar) {
      const id = GRAMMAR_KEY_GATES[t.grammar];
      if (id) used.add(id);
    }
    if (t.kind !== 'word' || !t.wordIds[0]) return;
    const form = t.form ?? (isVerb(t.wordIds[0]) ? 'dict' : undefined);
    const id = form ? FORM_GATES[form] : null;
    if (id) used.add(id);
    if (form === 'te' && next?.kind === 'word' && next.wordIds.includes('iru-be'))
      used.add('te-iru');
    if (form === 'te' && next?.kind === 'grammar' && next.grammar === 'kara') used.add('te-kara');
    if (t.wordIds.includes('naru')) {
      const prev = content[i - 1];
      if (prev?.form === 'ku' || (prev?.kind === 'grammar' && prev.grammar === 'ni'))
        used.add('naru');
    }
  });
  return used;
}
