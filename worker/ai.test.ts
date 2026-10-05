import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1Shim } from '../tests/d1-shim.ts';
import type { AiChatResponse, AiExerciseResponse } from '../src/shared/ai.ts';
import type { Env } from './env.ts';
import { app } from './index.ts';

const CODE = 'sakura-2026';
const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);

let db: D1Shim;
let env: Env;
/** Model answers, served in order (Groq response format). */
let answers: unknown[];
let calls: { url: string; body: { messages: { content: string }[] } }[];

function groq(content: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

async function call(path: string, json?: unknown, cookie?: string) {
  const headers = new Headers({ 'cf-connecting-ip': '203.0.113.7' });
  if (cookie) headers.set('cookie', cookie);
  if (json !== undefined) headers.set('content-type', 'application/json');
  return app.request(
    `http://localhost${path}`,
    { method: json === undefined ? 'GET' : 'POST', headers, body: JSON.stringify(json) },
    env,
  );
}

async function unlock(): Promise<string> {
  const res = await call('/api/unlock', { code: CODE });
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  db = new D1Shim();
  env = {
    DB: db as unknown as D1Database,
    ASSETS: {} as Fetcher,
    APP_ACCESS_CODE: CODE,
    COOKIE_SECRET: 'b'.repeat(64),
    GROQ_API_KEY: 'test-key',
  };
  answers = [];
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    const next = answers.shift();
    return next === undefined ? new Response('{}', { status: 500 }) : groq(next);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ok = { ja: '私は学生です。', kana: 'わたしは がくせいです。', pl: 'Jestem studentem.' };
const ok2 = {
  ja: '先生は日本人です。',
  kana: 'せんせいは にほんじんです。',
  pl: 'Nauczyciel jest Japończykiem.',
};
const ok3 = {
  ja: '私はポーランド人です。',
  kana: 'わたしは ポーランドじんです。',
  pl: 'Jestem Polakiem.',
};
// Verbs come at lesson 29: not allowed at lesson 17.
const tooHard = {
  ja: '私はパンを食べます。',
  kana: 'わたしは パンを たべます。',
  pl: 'Jem chleb.',
};
// Wrong reading for the written sentence.
const badReading = {
  ja: '私は学生です。',
  kana: 'わたしは せんせいです。',
  pl: 'Jestem studentem.',
};

describe('POST /api/ai/exercise', () => {
  it('returns only sentences that pass the whitelist, then serves them from the cache', async () => {
    const cookie = await unlock();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    answers.push({ sentences: [ok, tooHard, ok2, badReading, ok3, ok] });
    const res = await call('/api/ai/exercise', { lesson: 17 }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiExerciseResponse;
    expect(body).toEqual({ sentences: [ok, ok2, ok3], cached: false });
    // The prompt carries the whitelist and no profile data.
    const prompt = calls[0]?.body.messages.map((m) => m.content).join('\n') ?? '';
    expect(prompt).toContain('学生(がくせい)');
    expect(prompt).not.toContain('Ola');

    const again = (await (
      await call('/api/ai/exercise', { lesson: 17 }, cookie)
    ).json()) as AiExerciseResponse;
    expect(again).toEqual({ sentences: [ok, ok2, ok3], cached: true });
    expect(calls).toHaveLength(1);
  });

  it('refuses a set with too few valid sentences', async () => {
    const cookie = await unlock();
    answers.push({ sentences: [ok, tooHard] });
    const res = await call('/api/ai/exercise', { lesson: 17 }, cookie);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'ai_unavailable' });
  });

  it('is off without keys and validates the body', async () => {
    const cookie = await unlock();
    delete env.GROQ_API_KEY;
    expect((await call('/api/ai/exercise', { lesson: 17 }, cookie)).status).toBe(503);
    expect((await call('/api/ai/exercise', { lesson: 3 }, cookie)).status).toBe(400);
    expect((await call('/api/ai/exercise', { lesson: 17 })).status).toBe(401);
  });

  it('rate limits model calls', async () => {
    const cookie = await unlock();
    for (let i = 0; i < 20; i++) answers.push({ sentences: [] });
    for (let i = 0; i < 20; i++) await call('/api/ai/exercise', { lesson: 17 }, cookie);
    const res = await call('/api/ai/exercise', { lesson: 17 }, cookie);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('POST /api/ai/chat', () => {
  it('starts a conversation with a validated line and a suggestion', async () => {
    const cookie = await unlock();
    answers.push({ reply: ok2, suggestion: ok3 });
    const body = (await (
      await call('/api/ai/chat', { lesson: 17, history: [] }, cookie)
    ).json()) as AiChatResponse;
    expect(body).toEqual({ reply: ok2, suggestion: ok3, done: false });
  });

  it('judges the learner line first, keeping only a valid correction and known grammar', async () => {
    const cookie = await unlock();
    answers.push({ ok: false, corrected: ok, grammarIds: ['wa-desu', 'te-form', 'made-up'] });
    answers.push({ reply: ok2, suggestion: tooHard });
    const res = await call(
      '/api/ai/chat',
      {
        lesson: 17,
        history: [
          { role: 'ai', ja: ok2.ja },
          { role: 'learner', ja: 'わたしが がくせいです' },
        ],
      },
      cookie,
    );
    const body = (await res.json()) as AiChatResponse;
    expect(body.feedback).toEqual({ ok: false, corrected: ok, grammarIds: ['wa-desu'] });
    expect(body.reply).toEqual(ok2);
    // The suggestion used untaught words, so it is dropped.
    expect(body.suggestion).toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  it('retries a line with untaught words once, then marks what is unknown', async () => {
    const cookie = await unlock();
    answers.push({ reply: tooHard }, { reply: tooHard });
    const body = (await (
      await call('/api/ai/chat', { lesson: 17, history: [] }, cookie)
    ).json()) as AiChatResponse;
    // Named as the learner sees them: in kana.
    expect(body.reply.unknown).toContain('たべます');
    expect(body.reply.unknown).not.toContain('食べます');
    expect(calls[1]?.body.messages.at(-1)?.content).toMatch(/not allowed/);
  });

  it('never shows a line whose kana does not spell it', async () => {
    const cookie = await unlock();
    const past = { ...ok, kana: 'わたしは がくせいでした。' };
    answers.push({ reply: past }, { reply: past });
    const res = await call('/api/ai/chat', { lesson: 17, history: [] }, cookie);
    expect(res.status).toBe(503);
    expect(calls[1]?.body.messages.at(-1)?.content).toMatch(/did not spell/);

    answers.push({ reply: past }, { reply: ok2 });
    const body = (await (
      await call('/api/ai/chat', { lesson: 17, history: [] }, cookie)
    ).json()) as AiChatResponse;
    expect(body.reply).toEqual(ok2);
  });

  it('closes the conversation after the last learner turn', async () => {
    const cookie = await unlock();
    answers.push({ ok: true }, { reply: ok3 });
    const history = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 ? 'learner' : 'ai',
      ja: i % 2 ? 'はい' : ok.ja,
    }));
    const body = (await (
      await call('/api/ai/chat', { lesson: 17, history }, cookie)
    ).json()) as AiChatResponse;
    expect(body).toMatchObject({ done: true, feedback: { ok: true, grammarIds: [] } });
  });
});
