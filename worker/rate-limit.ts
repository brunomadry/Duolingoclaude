/**
 * Fixed-window counters stored in D1. Good enough for two users: one row per key,
 * one atomic UPSERT per hit. Limits are configurable per call site.
 */
export interface RateLimit {
  /** Max hits allowed per window. */
  limit: number;
  windowMs: number;
}

/** Records a hit and returns whether it is still within the limit. */
export async function hit(
  db: D1Database,
  key: string,
  { limit, windowMs }: RateLimit,
  nowMs: number,
): Promise<{ allowed: boolean; count: number; retryAfterMs: number }> {
  const windowStart = nowMs - (nowMs % windowMs);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start < ?2 THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start < ?2 THEN ?2 ELSE rate_limits.window_start END
       RETURNING count, window_start`,
    )
    .bind(key, windowStart)
    .first<{ count: number; window_start: number }>();
  const count = row?.count ?? 1;
  return {
    allowed: count <= limit,
    count,
    retryAfterMs: Math.max(0, (row?.window_start ?? windowStart) + windowMs - nowMs),
  };
}

/** Limits used by the API. Tune here; free tiers change, two users do not. */
export const LIMITS = {
  unlockPerIp: { limit: 10, windowMs: 15 * 60_000 },
  unlockGlobal: { limit: 60, windowMs: 15 * 60_000 },
  reportsPerIp: { limit: 30, windowMs: 60 * 60_000 },
  syncPerProfile: { limit: 240, windowMs: 60 * 60_000 },
  // Model calls for both learners together: well inside the free tiers.
  aiPerMinute: { limit: 20, windowMs: 60_000 },
  aiPerDay: { limit: 500, windowMs: 24 * 60 * 60_000 },
} satisfies Record<string, RateLimit>;
