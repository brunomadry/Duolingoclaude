/** Small helpers shared by the routes. */
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodMiniType, infer as Infer } from 'zod/mini';
import type { ApiError, ApiErrorCode } from '../src/shared/api.ts';
import type { Env } from './env.ts';

export type AppEnv = { Bindings: Env };
export type AppContext = Context<AppEnv>;

const STATUS: Record<ApiErrorCode, 400 | 401 | 404 | 410 | 413 | 429 | 500> = {
  bad_request: 400,
  locked: 401,
  not_found: 404,
  gone: 410,
  too_large: 413,
  rate_limited: 429,
  server_error: 500,
};

export function fail(
  code: ApiErrorCode,
  message?: string,
  headers: Record<string, string> = {},
): never {
  const body: ApiError = message ? { error: code, message } : { error: code };
  throw new HTTPException(STATUS[code], {
    res: new Response(JSON.stringify(body), {
      status: STATUS[code],
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
    }),
  });
}

/** Parses the JSON body against a strict schema or fails with 400. */
export async function readJson<T extends ZodMiniType>(c: AppContext, schema: T): Promise<Infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    fail('bad_request', 'invalid JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    fail('bad_request', first ? `${first.path.join('.')}: ${first.message}` : 'invalid body');
  }
  return parsed.data;
}

export function clientIp(c: AppContext): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}

/** Rejects client timestamps from the far future so a broken clock cannot win forever. */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60_000;
export function assertSaneTimestamp(ts: number, now: number): void {
  if (ts > now + MAX_CLOCK_SKEW_MS) fail('bad_request', 'timestamp too far in the future');
}
