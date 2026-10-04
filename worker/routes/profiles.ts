import { Hono } from 'hono';
import {
  ProfilePatchSchema,
  ProfileSchema,
  SyncRequestSchema,
  type ProfileRecord,
  type ProfilesResponse,
  type StateResponse,
  type SyncResponse,
} from '../../src/shared/api.ts';
import {
  cardFromRow,
  getProfile,
  lessonFromRow,
  profileFromRow,
  upsertCard,
  upsertLesson,
  upsertProfile,
  type CardRow,
  type LessonRow,
  type ProfileRow,
} from '../db.ts';
import { assertSaneTimestamp, fail, readJson, type AppEnv } from '../http.ts';
import { LIMITS, hit } from '../rate-limit.ts';

/**
 * Pulls report `serverTime` a few seconds in the past so a write that commits while a
 * pull is running is fetched again next time. Merging is idempotent, so the overlap is free.
 */
export const PULL_OVERLAP_MS = 5_000;
/** Soft-deleted profiles are hard-deleted (with their data) after this long. */
export const HARD_DELETE_AFTER_MS = 30 * 24 * 60 * 60_000;

export const profiles = new Hono<AppEnv>();

const UUID = /^[0-9a-f-]{36}$/i;

function profileId(id: string): string {
  if (!UUID.test(id)) fail('not_found');
  return id;
}

async function requireLiveProfile(db: D1Database, id: string): Promise<ProfileRecord> {
  const p = await getProfile(db, profileId(id));
  if (!p) fail('not_found');
  if (p.deletedAt !== null) fail('gone', 'profile deleted');
  return p;
}

// List every profile, tombstones included, so other devices learn about deletions.
profiles.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM profiles ORDER BY created_at',
  ).all<ProfileRow>();
  const body: ProfilesResponse = {
    serverTime: Date.now() - PULL_OVERLAP_MS,
    profiles: results.map(profileFromRow),
  };
  return c.json(body);
});

// Create (idempotent: the client picks the UUID so it can create profiles offline).
profiles.post('/', async (c) => {
  const now = Date.now();
  const p = await readJson(c, ProfileSchema);
  assertSaneTimestamp(p.updatedAt, now);
  if (p.deletedAt !== null) fail('bad_request', 'cannot create a deleted profile');
  await upsertProfile(c.env.DB, p, now).run();
  const stored = await getProfile(c.env.DB, p.id);
  if (!stored) fail('server_error');
  return c.json(stored, 201);
});

profiles.patch('/:id', async (c) => {
  const now = Date.now();
  const current = await requireLiveProfile(c.env.DB, c.req.param('id'));
  const patch = await readJson(c, ProfilePatchSchema);
  assertSaneTimestamp(patch.updatedAt, now);
  const next: ProfileRecord = {
    ...current,
    name: patch.name ?? current.name,
    avatar: patch.avatar ?? current.avatar,
    settings: { ...current.settings, ...patch.settings },
    updatedAt: patch.updatedAt,
  };
  await upsertProfile(c.env.DB, ProfileSchema.parse(next), now).run();
  return c.json(await getProfile(c.env.DB, current.id));
});

// Soft delete. The tombstone wins over any later edit from another device.
profiles.delete('/:id', async (c) => {
  const now = Date.now();
  const id = profileId(c.req.param('id'));
  const res = await c.env.DB.prepare(
    'UPDATE profiles SET deleted_at = ?1, updated_at = MAX(updated_at + 1, ?1), synced_at = ?1 WHERE id = ?2 AND deleted_at IS NULL',
  )
    .bind(now, id)
    .run();
  if (!res.meta.changes && !(await getProfile(c.env.DB, id))) fail('not_found');
  return c.json({ ok: true });
});

profiles.get('/:id/state', async (c) => {
  const db = c.env.DB;
  const profile = await requireLiveProfile(db, c.req.param('id'));
  const sinceRaw = c.req.query('since');
  const since = sinceRaw === undefined ? 0 : Number(sinceRaw);
  if (!Number.isFinite(since) || since < 0) fail('bad_request', 'invalid since');
  const serverTime = Date.now() - PULL_OVERLAP_MS;

  const [cards, lessons] = await db.batch<CardRow | LessonRow>([
    db
      .prepare('SELECT * FROM cards WHERE profile_id = ?1 AND synced_at > ?2')
      .bind(profile.id, since),
    db
      .prepare('SELECT * FROM lesson_progress WHERE profile_id = ?1 AND synced_at > ?2')
      .bind(profile.id, since),
  ]);
  const body: StateResponse = {
    serverTime,
    profile,
    cards: ((cards?.results ?? []) as CardRow[]).map(cardFromRow),
    lessons: ((lessons?.results ?? []) as LessonRow[]).map(lessonFromRow),
  };
  return c.json(body);
});

profiles.post('/:id/sync', async (c) => {
  const now = Date.now();
  const db = c.env.DB;
  const profile = await requireLiveProfile(db, c.req.param('id'));
  const limit = await hit(db, `sync:${profile.id}`, LIMITS.syncPerProfile, now);
  if (!limit.allowed) fail('rate_limited');

  const { changes } = await readJson(c, SyncRequestSchema);
  const statements: D1PreparedStatement[] = [];
  for (const change of changes) {
    assertSaneTimestamp(change.record.updatedAt, now);
    switch (change.kind) {
      case 'profile':
        if (change.record.id !== profile.id) fail('bad_request', 'profile id mismatch');
        statements.push(upsertProfile(db, change.record, now));
        break;
      case 'card':
        if (change.record.profileId !== profile.id) fail('bad_request', 'card profile mismatch');
        if (JSON.stringify(change.record.data).length > 4096)
          fail('too_large', 'card data too large');
        statements.push(upsertCard(db, change.record, now));
        break;
      case 'lesson':
        if (change.record.profileId !== profile.id) fail('bad_request', 'lesson profile mismatch');
        statements.push(upsertLesson(db, change.record, now));
        break;
    }
  }

  let applied = 0;
  if (statements.length) {
    const results = await db.batch(statements);
    applied = results.reduce((sum, r) => sum + (r.meta.changes ?? 0), 0);
  }
  const body: SyncResponse = {
    serverTime: now - PULL_OVERLAP_MS,
    applied,
    ignored: changes.length - applied,
  };
  return c.json(body);
});

/** Daily cleanup: hard delete profiles soft-deleted long ago (cards and progress cascade). */
export async function hardDeleteExpired(db: D1Database, now: number): Promise<number> {
  const cutoff = now - HARD_DELETE_AFTER_MS;
  const ids = await db
    .prepare('SELECT id FROM profiles WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .bind(cutoff)
    .all<{ id: string }>();
  if (!ids.results.length) return 0;
  const stmts = ids.results.flatMap(({ id }) => [
    db.prepare('DELETE FROM cards WHERE profile_id = ?').bind(id),
    db.prepare('DELETE FROM lesson_progress WHERE profile_id = ?').bind(id),
    db.prepare('DELETE FROM profiles WHERE id = ?').bind(id),
  ]);
  await db.batch(stmts);
  return ids.results.length;
}
