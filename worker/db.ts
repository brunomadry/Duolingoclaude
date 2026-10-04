/** Row <-> record mapping and the last-write-wins upserts. */
import type {
  CardRecord,
  LessonProgressRecord,
  ProfileRecord,
  ProfileSettings,
} from '../src/shared/api.ts';

export interface ProfileRow {
  id: string;
  name: string;
  avatar: string;
  settings: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  synced_at: number;
}

export interface CardRow {
  profile_id: string;
  card_id: string;
  data: string;
  updated_at: number;
  deleted: number;
}

export interface LessonRow {
  profile_id: string;
  lesson_n: number;
  completed_at: number;
  score: number | null;
  updated_at: number;
}

export function profileFromRow(r: ProfileRow): ProfileRecord {
  return {
    id: r.id,
    name: r.name,
    avatar: r.avatar as ProfileRecord['avatar'],
    settings: JSON.parse(r.settings) as ProfileSettings,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export function cardFromRow(r: CardRow): CardRecord {
  return {
    profileId: r.profile_id,
    cardId: r.card_id,
    data: JSON.parse(r.data) as Record<string, unknown>,
    updatedAt: r.updated_at,
    deleted: r.deleted === 1,
  };
}

export function lessonFromRow(r: LessonRow): LessonProgressRecord {
  return {
    profileId: r.profile_id,
    n: r.lesson_n,
    completedAt: r.completed_at,
    score: r.score,
    updatedAt: r.updated_at,
  };
}

export async function getProfile(db: D1Database, id: string): Promise<ProfileRecord | null> {
  const row = await db.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first<ProfileRow>();
  return row ? profileFromRow(row) : null;
}

/**
 * Last write wins on `updated_at`; ties keep what the server has (first arrival),
 * which the client mirrors by preferring the server copy on equal timestamps.
 * A soft-deleted profile is a tombstone: nothing resurrects it.
 */
export function upsertProfile(
  db: D1Database,
  p: ProfileRecord,
  syncedAt: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO profiles (id, name, avatar, settings, created_at, updated_at, deleted_at, synced_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, avatar = excluded.avatar, settings = excluded.settings,
         updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, synced_at = excluded.synced_at
       WHERE profiles.deleted_at IS NULL AND excluded.updated_at > profiles.updated_at`,
    )
    .bind(
      p.id,
      p.name,
      p.avatar,
      JSON.stringify(p.settings),
      p.createdAt,
      p.updatedAt,
      p.deletedAt,
      syncedAt,
    );
}

export function upsertCard(db: D1Database, c: CardRecord, syncedAt: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO cards (profile_id, card_id, data, updated_at, deleted, synced_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (profile_id, card_id) DO UPDATE SET
         data = excluded.data, updated_at = excluded.updated_at,
         deleted = excluded.deleted, synced_at = excluded.synced_at
       WHERE excluded.updated_at > cards.updated_at`,
    )
    .bind(c.profileId, c.cardId, JSON.stringify(c.data), c.updatedAt, c.deleted ? 1 : 0, syncedAt);
}

export function upsertLesson(
  db: D1Database,
  l: LessonProgressRecord,
  syncedAt: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO lesson_progress (profile_id, lesson_n, completed_at, score, updated_at, synced_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (profile_id, lesson_n) DO UPDATE SET
         completed_at = excluded.completed_at, score = excluded.score,
         updated_at = excluded.updated_at, synced_at = excluded.synced_at
       WHERE excluded.updated_at > lesson_progress.updated_at`,
    )
    .bind(l.profileId, l.n, l.completedAt, l.score, l.updatedAt, syncedAt);
}
