import { describe, expect, it } from 'vitest';
import { LlmError, createLlm, type LlmRequest } from './llm.ts';

const REQ: LlmRequest = { system: 'sys', user: 'hi', temperature: 0.3, maxTokens: 200, json: true };

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function fakeFetch(handler: Handler) {
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: JSON.parse(String(init?.body ?? '{}')),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return handler(url, init ?? {});
  }) as typeof fetch;
  return { impl, calls };
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const groqOk = () => json({ choices: [{ message: { content: '{"a":1}' } }] });
const geminiOk = () => json({ candidates: [{ content: { parts: [{ text: '{"b":2}' }] } }] });

describe('createLlm', () => {
  it('calls Groq with an OpenAI-style JSON request first', async () => {
    const { impl, calls } = fakeFetch(() => groqOk());
    const llm = createLlm({ groqKey: 'g', geminiKey: 'm', fetch: impl });
    const res = await llm.complete(REQ);
    expect(res).toEqual({ text: '{"a":1}', provider: 'groq', model: 'llama-3.3-70b-versatile' });
    expect(calls[0]?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(calls[0]?.headers.authorization).toBe('Bearer g');
    expect(calls[0]?.body).toMatchObject({
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
    });
  });

  it('falls back to Gemini when Groq is rate limited', async () => {
    const { impl, calls } = fakeFetch((url) =>
      url.includes('groq') ? json({ error: 'slow down' }, 429, { 'retry-after': '7' }) : geminiOk(),
    );
    const llm = createLlm({ groqKey: 'g', geminiKey: 'm', geminiModel: 'gemini-x', fetch: impl });
    const res = await llm.complete(REQ);
    expect(res.provider).toBe('gemini');
    expect(res.text).toBe('{"b":2}');
    expect(calls[1]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent?key=m',
    );
    expect(calls[1]?.body).toMatchObject({
      systemInstruction: { parts: [{ text: 'sys' }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
      },
    });
  });

  it('reports the last error with its retry hint when every provider fails', async () => {
    const { impl } = fakeFetch(() => json({}, 429, { 'retry-after': '30' }));
    const llm = createLlm({ groqKey: 'g', geminiKey: 'm', fetch: impl });
    const err = await llm.complete(REQ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err).toMatchObject({ kind: 'rate_limited', provider: 'gemini', retryAfterMs: 30_000 });
  });

  it('skips providers without a key and fails clearly with none', async () => {
    const { impl, calls } = fakeFetch(() => geminiOk());
    expect(createLlm({ geminiKey: 'm', fetch: impl }).providers).toEqual(['gemini']);
    await createLlm({ geminiKey: 'm', fetch: impl }).complete(REQ);
    expect(calls).toHaveLength(1);
    await expect(createLlm({ fetch: impl }).complete(REQ)).rejects.toMatchObject({
      kind: 'config',
    });
  });

  it('treats empty or malformed answers as bad responses and moves on', async () => {
    const { impl } = fakeFetch((url) =>
      url.includes('groq') ? json({ choices: [] }) : geminiOk(),
    );
    const res = await createLlm({ groqKey: 'g', geminiKey: 'm', fetch: impl }).complete(REQ);
    expect(res.provider).toBe('gemini');
    const bad = fakeFetch(() => new Response('<html>', { status: 200 }));
    await expect(createLlm({ groqKey: 'g', fetch: bad.impl }).complete(REQ)).rejects.toMatchObject({
      kind: 'bad_response',
    });
  });

  it('times out slow providers', async () => {
    const slow: Handler = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    const { impl } = fakeFetch(slow);
    await expect(
      createLlm({ groqKey: 'g', fetch: impl, timeoutMs: 20 }).complete(REQ),
    ).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('does not send JSON mode when not asked', async () => {
    const { impl, calls } = fakeFetch(() => groqOk());
    await createLlm({ groqKey: 'g', fetch: impl }).complete({ ...REQ, json: false });
    expect(calls[0]?.body).not.toHaveProperty('response_format');
  });
});
