/**
 * AI proxy: practice sentences and the lesson conversation. Keys stay in Worker secrets;
 * every Japanese sentence from the model is validated against what the lesson has taught
 * before it reaches the app (see src/shared/ai.ts). Exercise sets are cached in D1.
 */
import { Hono } from 'hono';
import {
  CHAT_TURNS,
  chatPrompt,
  checkAiSentence,
  correctionPrompt,
  exercisePrompt,
  parseJsonObject,
  readCorrection,
  readExerciseAnswer,
  readSentence,
  type AiChatResponse,
  type AiExerciseResponse,
  type AiSentence,
  type ChatFeedback,
} from '../../src/shared/ai.ts';
import { AiChatRequestSchema, AiExerciseRequestSchema } from '../../src/shared/api.ts';
import { createLlm, LlmError, type Llm } from '../../src/shared/llm.ts';
import { lessonContext, validatorDeps, whitelistHash } from '../content.ts';
import { fail, readJson, type AppContext, type AppEnv } from '../http.ts';
import { LIMITS, hit } from '../rate-limit.ts';

export const ai = new Hono<AppEnv>();

/** Fewer valid sentences than this and the set is not worth showing (or caching). */
const MIN_EXERCISE_SENTENCES = 3;
/** Cached variants per lesson, so extra practice does not always show the same set. */
const EXERCISE_VARIANTS = 3;

function llmFor(c: AppContext): Llm {
  const llm = createLlm({
    groqKey: c.env.GROQ_API_KEY,
    geminiKey: c.env.GEMINI_API_KEY,
    groqModel: c.env.GROQ_MODEL,
    geminiModel: c.env.GEMINI_MODEL,
    timeoutMs: 20_000,
  });
  if (!llm.providers.length) fail('ai_unavailable', 'no AI provider configured');
  return llm;
}

async function complete(
  c: AppContext,
  llm: Llm,
  prompt: { system: string; user: string },
  maxTokens: number,
): Promise<string> {
  const now = Date.now();
  const minute = await hit(c.env.DB, 'ai:minute', LIMITS.aiPerMinute, now);
  const day = await hit(c.env.DB, 'ai:day', LIMITS.aiPerDay, now);
  const blocked = !minute.allowed ? minute : !day.allowed ? day : null;
  if (blocked) {
    fail('rate_limited', 'AI limit reached', {
      'retry-after': String(Math.ceil(blocked.retryAfterMs / 1000)),
    });
  }
  try {
    return (await llm.complete({ ...prompt, temperature: 0.3, maxTokens, json: true })).text;
  } catch (e) {
    if (!(e instanceof LlmError)) throw e;
    if (e.kind === 'rate_limited') {
      fail('rate_limited', 'AI provider busy', {
        'retry-after': String(Math.ceil((e.retryAfterMs ?? 30_000) / 1000)),
      });
    }
    fail('ai_unavailable', e.kind);
  }
}

ai.post('/exercise', async (c) => {
  const { lesson } = await readJson(c, AiExerciseRequestSchema);
  const ctx = lessonContext(lesson);
  if (!ctx) fail('bad_request', 'this lesson has no sentences');
  const hash = await whitelistHash(lesson);
  const variant = Math.floor(Math.random() * EXERCISE_VARIANTS);
  const key = `exercise:${lesson}:${hash}:${variant}`;
  const cached = await c.env.DB.prepare('SELECT payload FROM ai_cache WHERE key = ?1')
    .bind(key)
    .first<{ payload: string }>();
  if (cached) {
    const body: AiExerciseResponse = {
      sentences: JSON.parse(cached.payload) as AiSentence[],
      cached: true,
    };
    return c.json(body);
  }
  const text = await complete(c, llmFor(c), exercisePrompt(ctx), 2500);
  const sentences = readExerciseAnswer(text, lesson, validatorDeps());
  if (sentences.length < MIN_EXERCISE_SENTENCES) fail('ai_unavailable', 'too few valid sentences');
  await c.env.DB.prepare(
    `INSERT INTO ai_cache (key, kind, lesson_n, whitelist_hash, payload, created_at)
     VALUES (?1, 'exercise', ?2, ?3, ?4, ?5) ON CONFLICT (key) DO NOTHING`,
  )
    .bind(key, lesson, hash, JSON.stringify(sentences), Date.now())
    .run();
  const body: AiExerciseResponse = { sentences, cached: false };
  return c.json(body);
});

ai.post('/chat', async (c) => {
  const { lesson, history } = await readJson(c, AiChatRequestSchema);
  const ctx = lessonContext(lesson);
  if (!ctx) fail('bad_request', 'this lesson has no conversation');
  const llm = llmFor(c);
  const deps = validatorDeps();

  // Two separate prompts: the learner's line is judged first, then the partner answers.
  let feedback: ChatFeedback | undefined;
  const last = history.at(-1);
  if (last?.role === 'learner') {
    const text = await complete(c, llm, correctionPrompt(ctx, last.ja), 400);
    feedback = readCorrection(text, lesson, deps, ctx.grammar) ?? undefined;
  }

  const closing = history.filter((t) => t.role === 'learner').length >= CHAT_TURNS;
  let reply: AiSentence | null = null;
  let suggestion: AiSentence | undefined;
  let offending: string[] = [];
  let retryNote = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = chatPrompt(ctx, history, closing);
    const data = parseJsonObject(
      await complete(c, llm, { ...prompt, user: prompt.user + retryNote }, 500),
    ) as Record<string, unknown> | null;
    const line = readSentence(data?.reply);
    if (!line) continue;
    const verdict = checkAiSentence(line, lesson, deps);
    // A line whose kana does not spell it is never shown (learners read the kana); one that
    // still uses untaught words after the retry is shown with those words marked.
    if (verdict.readingOk) {
      reply = line;
      offending = verdict.offending;
      const hint = readSentence(data?.suggestion);
      suggestion = hint && checkAiSentence(hint, lesson, deps).ok ? hint : undefined;
    }
    if (verdict.ok) break;
    retryNote = [
      '',
      ...(verdict.offending.length
        ? [
            `Your previous line used words that are not allowed (${verdict.offending.join(', ')}). Use only the allowed words.`,
          ]
        : []),
      ...(verdict.readingOk
        ? []
        : ['In your previous line "kana" did not spell "ja" exactly: give the full kana reading.']),
    ].join('\n');
  }
  if (!reply) fail('ai_unavailable', 'no usable reply');
  const body: AiChatResponse = {
    reply: offending.length ? { ...reply, unknown: offending } : reply,
    ...(suggestion ? { suggestion } : {}),
    ...(feedback ? { feedback } : {}),
    done: closing,
  };
  return c.json(body);
});
