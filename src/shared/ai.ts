/**
 * AI exercises and conversation: prompts, parsing and the whitelist validator. The model
 * only ever produces practice material (sentences, a conversation partner's lines and a
 * correction of the learner's sentence); grammar explanations always come from the static,
 * reviewed notes, so a correction only names the grammar point by id.
 *
 * Every Japanese sentence the model returns is checked with the same word matcher and
 * grammar gates as the course content: only words and grammar taught by the lesson pass.
 * Pure and dependency-free (no zod), shared by the Worker and the tests.
 */
import { checkTokens, readingProblems, type Gates } from './grammar-gates.ts';
import { tokenize, type Lexicon } from './jp-words.ts';

export interface AiSentence {
  ja: string;
  /** Kana reading with spaces between phrases. */
  kana: string;
  pl: string;
}

export interface AiWord {
  written: string;
  kana: string;
  en: string;
}

export interface AiLessonContext {
  lessonN: number;
  /** Every word taught by the lesson (the whitelist). */
  words: readonly AiWord[];
  /** Words of the lesson itself (to be used often). */
  newWords: readonly AiWord[];
  /** Grammar ids taught by the lesson, oldest first. */
  grammar: readonly string[];
  /** The lesson's grammar point. */
  focus: string | null;
}

export interface ChatTurn {
  role: 'ai' | 'learner';
  ja: string;
}

export interface ChatFeedback {
  ok: boolean;
  /** A corrected version of the learner's sentence (validated like everything else). */
  corrected?: AiSentence;
  /** Grammar points involved in the mistake (links to the static notes). */
  grammarIds: string[];
}

export interface AiChatResponse {
  reply: AiSentence & { unknown?: string[] };
  /** A possible answer the learner may use. */
  suggestion?: AiSentence;
  feedback?: ChatFeedback;
  done: boolean;
}

export interface AiExerciseResponse {
  sentences: AiSentence[];
  cached: boolean;
}

/** The conversation partner's name (katakana, allowed although not a vocabulary word). */
export const AI_PERSONA = 'ユキ';
/** Learner turns per conversation. */
export const CHAT_TURNS = 4;
export const EXERCISE_SENTENCES = 10;
const MAX_JA = 60;
const MAX_PL = 200;

/** Short English descriptions of the grammar points, for the prompts. */
export const GRAMMAR_EN: Readonly<Record<string, string>> = {
  'wa-desu': 'X は Y です (topic and copula), よ, ね, さん',
  'ka-question': 'questions with か, そうです, negative copula じゃありません',
  'kore-sore-are': 'これ, それ, あれ, どれ',
  'kono-sono-ano': 'この, その, あの, どの; ここ, そこ, あそこ',
  'no-mo': 'particles の (possession), も (also), と, や',
  'masu-wo': 'verbs in the polite ます form, object particle を',
  'ni-he': 'particles に (time, destination), へ, から, まで; stem + に行く',
  'de-place-means': 'particle で (place of action, means)',
  'masen-mashita': 'ません, ました, ませんでした, でした',
  'i-adjectives': 'i-adjectives and their negative and past forms',
  'na-adjectives': 'na-adjectives with な, 好き/嫌い/上手/下手 with が',
  'arimasu-imasu': 'existence: あります, います; positions',
  'numbers-time': 'numbers, 時, 分, ごろ',
  counters: 'counters (つ, 人, 枚, 本, 円...) and dates',
  'te-form': 'the て-form of verbs',
  'te-kudasai': 'requests with ～てください',
  'tai-mashou': '～たい (want to), ～ましょう (let us)',
  'yori-hou': 'comparisons with より, のほうが, いちばん',
  'kara-demo': 'から (because), でも, が and けど (but), ので',
  'plain-da': 'plain copula だ',
  'plain-dictionary': 'dictionary form of verbs, こと',
  'plain-nai': 'plain negative ～ない',
  'plain-ta': 'plain past ～た, だった',
  'plain-nakatta': 'plain past negative ～なかった',
  'te-iru': '～ている (ongoing actions and states)',
  'adjectives-plain': 'plain adjective forms, ～くて, ～じゃなくて',
  'casual-speech': 'casual speech, ～んです',
  hoshii: '～がほしい (want something)',
  'mae-ato': 'とき, 前に, 後で',
  'te-kara': '～てから (after doing)',
  deshou: 'でしょう, だろう',
  'mou-mada': 'もう and まだ',
  naru: '～くなる, ～になる (become)',
};

/** Polite style until plain forms are taught (lesson 61). */
export function politeOnly(lessonN: number): boolean {
  return lessonN < 61;
}

function wordList(words: readonly AiWord[]): string {
  return words
    .map((w) => `${w.written}${w.written !== w.kana ? `(${w.kana})` : ''}=${w.en}`)
    .join('; ');
}

function grammarList(ctx: AiLessonContext): string {
  return ctx.grammar.map((g) => GRAMMAR_EN[g] ?? g).join('; ');
}

const SENTENCE_FORMAT =
  '{"ja": "natural Japanese with usual N5 kanji, no spaces", "kana": "full reading in hiragana/katakana with a space between phrases (bunsetsu), particles attached to the previous word", "pl": "natural Polish translation"}';

const RULES = (ctx: AiLessonContext) => `Strict rules:
- Use ONLY these words (any taught inflection) and nothing else: ${wordList(ctx.words)}.
- Use ONLY this grammar: ${grammarList(ctx)}. Never use たら, たり, the volitional form, ながら, なさい or てしまう.
- ${politeOnly(ctx.lessonN) ? 'Polite です/ます style only; no plain forms.' : 'Polite or plain style as fits.'}
- Numbers only if numbers are in the grammar list. No personal names except ${AI_PERSONA}. No romaji.
- Short, natural, everyday sentences for adult beginners; nothing sensitive.`;

export function exercisePrompt(ctx: AiLessonContext, count = EXERCISE_SENTENCES) {
  const focus = ctx.focus ? (GRAMMAR_EN[ctx.focus] ?? ctx.focus) : 'the grammar above';
  return {
    system: `You write practice sentences for a Japanese course for Polish speakers (JLPT N5, lesson ${ctx.lessonN}).
${RULES(ctx)}
Answer with a JSON object {"sentences": [${SENTENCE_FORMAT}, ...]}.`,
    user: `Write ${count} different sentences that practise: ${focus}. Use these new words where natural: ${wordList(ctx.newWords)}. Each sentence 4 to 20 Japanese characters.`,
  };
}

export function chatPrompt(ctx: AiLessonContext, history: readonly ChatTurn[], closing: boolean) {
  const transcript = history
    .map((t) => `${t.role === 'ai' ? AI_PERSONA : 'Learner'}: ${t.ja}`)
    .join('\n');
  return {
    system: `You are ${AI_PERSONA}, a friendly Japanese person chatting with a Polish beginner (JLPT N5, lesson ${ctx.lessonN}). Keep the conversation going with one short line at a time; never correct the learner and never explain grammar.
${RULES(ctx)}
Topic: everyday small talk using the new words of the lesson: ${wordList(ctx.newWords)}.
Answer with a JSON object {"reply": ${SENTENCE_FORMAT}, "suggestion": ${SENTENCE_FORMAT}} where "reply" is your next line (at most 25 Japanese characters, usually ending with a simple question) and "suggestion" is one possible short answer the learner could give to it.`,
    user: history.length
      ? `Conversation so far:\n${transcript}\n${closing ? 'Now close the conversation kindly in one short line (no question); the suggestion may be a short goodbye.' : 'Your next line:'}`
      : 'Start the conversation with a greeting and a simple question.',
  };
}

export function correctionPrompt(ctx: AiLessonContext, learnerJa: string) {
  return {
    system: `You check one sentence written by a Polish beginner learning Japanese (JLPT N5, lesson ${ctx.lessonN}). Judge only what the learner wrote; do not rewrite correct sentences, do not comment on style, do not explain.
Grammar points you may name (ids): ${ctx.grammar.join(', ')}.
Answer with a JSON object {"ok": true} when the sentence is correct Japanese (kana-only writing is fine), otherwise {"ok": false, "corrected": ${SENTENCE_FORMAT}, "grammarIds": ["<ids of the grammar points involved>"]}. The corrected sentence must stay as close as possible to the learner's and use ONLY these words: ${wordList(ctx.words)}.`,
    user: `Learner's sentence: ${learnerJa}`,
  };
}

/** Parses a JSON object from a model answer (tolerates code fences and surrounding text). */
export function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const isString = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** A well-formed sentence object, trimmed, or null. */
export function readSentence(v: unknown): AiSentence | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isString(o.ja, MAX_JA) || !isString(o.kana, MAX_JA * 2) || !isString(o.pl, MAX_PL))
    return null;
  const ja = o.ja.trim().replace(/\s+/g, '');
  const kana = o.kana.trim().replace(/\s+/g, ' ');
  // The reading must be kana (and punctuation) only.
  if (/[㐀-鿿A-Za-z]/.test(kana)) return null;
  return { ja, kana, pl: o.pl.trim() };
}

export interface ValidatorDeps {
  lexicon: Lexicon;
  gates: Gates;
  lessonOfWord: ReadonlyMap<string, number>;
  posOfWord: ReadonlyMap<string, readonly string[]>;
}

export interface SentenceVerdict {
  ok: boolean;
  problems: string[];
  /** The kana reading spells the sentence token for token (learners mostly read the kana). */
  readingOk: boolean;
  /** Surfaces the matcher does not know or the lesson has not taught, in kana when possible. */
  offending: string[];
}

const quotedSurfaces = (problems: readonly string[]) =>
  [...new Set(problems.map((p) => /"([^"]+)"/.exec(p)?.[1] ?? ''))].filter(Boolean);

/** Checks an AI sentence against what lesson n has taught, and its reading against it. */
export function checkAiSentence(
  s: AiSentence,
  lessonN: number,
  deps: ValidatorDeps,
): SentenceVerdict {
  const allowSurfaces = new Set([AI_PERSONA]);
  const ctx = { lessonN, ...deps, allowSurfaces };
  const written = tokenize(s.ja, deps.lexicon);
  const reading = tokenize(s.kana, deps.lexicon);
  const result = checkTokens(written, ctx);
  const mismatch = readingProblems(written, reading, deps.lexicon, allowSurfaces);
  const readingOk = mismatch.length === 0;
  // The same tokens are flagged in both when the reading matches; name them as learners see them.
  const offending = quotedSurfaces(
    readingOk && !result.ok ? checkTokens(reading, ctx).problems : result.problems,
  );
  const problems = [...result.problems, ...mismatch];
  return { ok: problems.length === 0, problems, readingOk, offending };
}

/** Valid, distinct sentences from an exercise answer. */
export function readExerciseAnswer(
  text: string,
  lessonN: number,
  deps: ValidatorDeps,
): AiSentence[] {
  const data = parseJsonObject(text) as { sentences?: unknown } | null;
  const list = Array.isArray(data?.sentences) ? data.sentences : [];
  const out: AiSentence[] = [];
  for (const item of list) {
    const s = readSentence(item);
    if (!s || out.some((o) => o.ja === s.ja)) continue;
    if (checkAiSentence(s, lessonN, deps).ok) out.push(s);
  }
  return out;
}

/**
 * Reads a correction: a corrected sentence that fails the same check is dropped, and grammar
 * ids are limited to points the learner has been taught.
 */
export function readCorrection(
  text: string,
  lessonN: number,
  deps: ValidatorDeps,
  knownGrammar: readonly string[],
): ChatFeedback | null {
  const data = parseJsonObject(text) as Record<string, unknown> | null;
  if (!data || typeof data.ok !== 'boolean') return null;
  if (data.ok) return { ok: true, grammarIds: [] };
  const corrected = readSentence(data.corrected);
  const grammarIds = Array.isArray(data.grammarIds)
    ? data.grammarIds.filter((g): g is string => typeof g === 'string' && knownGrammar.includes(g))
    : [];
  return {
    ok: false,
    ...(corrected && checkAiSentence(corrected, lessonN, deps).ok ? { corrected } : {}),
    grammarIds: [...new Set(grammarIds)].slice(0, 3),
  };
}
