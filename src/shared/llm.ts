/**
 * LLM provider layer: Groq first, Google Gemini as fallback, behind one call.
 * Used by the Worker's AI proxy (Phase 5) and by the one-off gloss script. Free-tier
 * limits change often, so models, timeouts and limits are configuration, not code.
 *
 * Only plain fetch; runs in Workers and in Node 22 (behind an HTTPS proxy Node needs
 * NODE_USE_ENV_PROXY=1). Callers must never put personal data (profile names) in prompts.
 */

export type ProviderName = 'groq' | 'gemini';

export interface LlmRequest {
  system: string;
  user: string;
  /** 0.2 to 0.4 for this app (brief). */
  temperature: number;
  maxTokens: number;
  /** Ask the provider for a JSON object response. */
  json: boolean;
}

export interface LlmResult {
  text: string;
  provider: ProviderName;
  model: string;
}

export type LlmErrorKind = 'config' | 'rate_limited' | 'unavailable' | 'bad_response' | 'timeout';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly provider: ProviderName | null;
  readonly retryAfterMs: number | null;

  constructor(
    kind: LlmErrorKind,
    provider: ProviderName | null,
    message: string,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.kind = kind;
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface LlmConfig {
  groqKey?: string;
  geminiKey?: string;
  /** Defaults are a starting point; check current free models and override via config. */
  groqModel?: string;
  geminiModel?: string;
  timeoutMs?: number;
  /** Provider order; default Groq, then Gemini. */
  order?: readonly ProviderName[];
  fetch?: typeof fetch;
}

export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

function retryAfter(res: Response): number | null {
  const header = res.headers.get('retry-after');
  const seconds = header === null ? NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

async function post(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  provider: ProviderName,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new LlmError(
      aborted ? 'timeout' : 'unavailable',
      provider,
      aborted ? 'timeout' : 'network error',
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429)
    throw new LlmError('rate_limited', provider, 'rate limited', retryAfter(res));
  if (!res.ok) throw new LlmError('unavailable', provider, `HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new LlmError('bad_response', provider, 'response is not JSON');
  }
}

async function callGroq(
  req: LlmRequest,
  key: string,
  model: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
) {
  const data = (await post(
    fetchImpl,
    GROQ_URL,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
    'groq',
    timeoutMs,
  )) as { choices?: { message?: { content?: unknown } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text)
    throw new LlmError('bad_response', 'groq', 'empty completion');
  return text;
}

async function callGemini(
  req: LlmRequest,
  key: string,
  model: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
) {
  const data = (await post(
    fetchImpl,
    `${GEMINI_URL}${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
    'gemini',
    timeoutMs,
  )) as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
  if (!text) throw new LlmError('bad_response', 'gemini', 'empty completion');
  return text;
}

export interface Llm {
  /** Tries each configured provider in order; throws the last LlmError if all fail. */
  complete(req: LlmRequest): Promise<LlmResult>;
  readonly providers: readonly ProviderName[];
}

export function createLlm(config: LlmConfig): Llm {
  const fetchImpl = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = config.timeoutMs ?? 20_000;
  const order = (config.order ?? ['groq', 'gemini']).filter((p) =>
    p === 'groq' ? Boolean(config.groqKey) : Boolean(config.geminiKey),
  );
  return {
    providers: order,
    async complete(req) {
      if (!order.length) throw new LlmError('config', null, 'no AI provider key configured');
      let last: LlmError | null = null;
      for (const provider of order) {
        try {
          if (provider === 'groq') {
            const model = config.groqModel || DEFAULT_GROQ_MODEL;
            return {
              text: await callGroq(req, config.groqKey ?? '', model, fetchImpl, timeoutMs),
              provider,
              model,
            };
          }
          const model = config.geminiModel || DEFAULT_GEMINI_MODEL;
          return {
            text: await callGemini(req, config.geminiKey ?? '', model, fetchImpl, timeoutMs),
            provider,
            model,
          };
        } catch (e) {
          if (!(e instanceof LlmError)) throw e;
          last = e;
        }
      }
      throw last ?? new LlmError('unavailable', null, 'no provider answered');
    },
  };
}
