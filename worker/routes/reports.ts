import { Hono } from 'hono';
import { ReportSchema } from '../../src/shared/api.ts';
import { clientIp, fail, readJson, type AppEnv } from '../http.ts';
import { LIMITS, hit } from '../rate-limit.ts';

export const reports = new Hono<AppEnv>();

// Idempotent on the client-chosen id, so the offline outbox can retry safely.
reports.post('/', async (c) => {
  const now = Date.now();
  const limit = await hit(c.env.DB, `reports:${clientIp(c)}`, LIMITS.reportsPerIp, now);
  if (!limit.allowed) fail('rate_limited');
  const r = await readJson(c, ReportSchema);
  await c.env.DB.prepare(
    `INSERT INTO reports (id, profile_id, lesson_n, sentence, note, context, created_at, received_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(r.id, r.profileId, r.lessonN, r.sentence, r.note, r.context, r.createdAt, now)
    .run();
  return c.json({ ok: true }, 201);
});
