/**
 * Local writes. Every mutation updates IndexedDB and queues an outbox entry in the
 * same transaction, so a change is never lost between "saved" and "queued".
 * The outbox keeps only the newest entry per record key (records are whole-record
 * last-write-wins, so older queued versions are useless).
 */
import type {
  CardRecord,
  LessonProgressRecord,
  ProfileRecord,
  ProfileSettings,
  ReportRecord,
} from '../shared/api.ts';
import type { AvatarId } from '../shared/avatars.ts';
import type { IDBPTransaction, StoreNames } from 'idb';
import type { AkaDB, Database, OutboxEntry } from './db.ts';

export type Tx = IDBPTransaction<AkaDB, StoreNames<AkaDB>[], 'readwrite'>;

/** Monotonic clock: never returns the same or a smaller value twice in one session. */
let lastStamp = 0;
export function stamp(now = Date.now()): number {
  lastStamp = Math.max(now, lastStamp + 1);
  return lastStamp;
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function enqueue(
  tx: IDBPTransaction<AkaDB, ('outbox' | StoreNames<AkaDB>)[], 'readwrite'>,
  entry: OutboxEntry,
): Promise<void> {
  const outbox = tx.objectStore('outbox');
  const existing = await outbox.index('byKey').getAllKeys(entry.key);
  for (const seq of existing) await outbox.delete(seq);
  await outbox.add(entry);
}

export async function listProfiles(db: Database): Promise<ProfileRecord[]> {
  const all = await db.getAll('profiles');
  return all.filter((p) => p.deletedAt === null).sort((a, b) => a.createdAt - b.createdAt);
}

export interface NewProfileInput {
  name: string;
  avatar: AvatarId;
  settings: ProfileSettings;
}

export async function createProfile(db: Database, input: NewProfileInput): Promise<ProfileRecord> {
  const now = stamp();
  const profile: ProfileRecord = {
    id: newId(),
    name: input.name.trim(),
    avatar: input.avatar,
    settings: input.settings,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await saveProfile(db, profile);
  return profile;
}

export async function saveProfile(db: Database, profile: ProfileRecord): Promise<void> {
  const tx = db.transaction(['profiles', 'outbox'], 'readwrite');
  await tx.objectStore('profiles').put(profile);
  await enqueue(tx, {
    key: `profile:${profile.id}`,
    type: 'profile',
    profileId: profile.id,
    record: profile,
  });
  await tx.done;
}

export async function updateProfile(
  db: Database,
  id: string,
  patch: Partial<Pick<ProfileRecord, 'name' | 'avatar'>> & { settings?: Partial<ProfileSettings> },
): Promise<ProfileRecord | undefined> {
  const current = await db.get('profiles', id);
  if (!current) return undefined;
  const next: ProfileRecord = {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
    settings: { ...current.settings, ...patch.settings },
    updatedAt: stamp(),
  };
  await saveProfile(db, next);
  return next;
}

/** Removes the profile and its data locally and queues the server-side soft delete. */
export async function deleteProfile(db: Database, id: string): Promise<void> {
  const tx = db.transaction(['profiles', 'cards', 'lessons', 'outbox'], 'readwrite');
  await removeLocalProfileData(tx, id);
  await enqueue(tx, { key: `profile-delete:${id}`, type: 'profile-delete', profileId: id });
  await tx.done;
}

/** Drops a profile, its cards, lessons and queued changes (not reports). */
export async function removeLocalProfileData(tx: Tx, id: string): Promise<void> {
  await tx.objectStore('profiles').delete(id);
  for (const store of ['cards', 'lessons'] as const) {
    const keys = await tx.objectStore(store).index('byProfile').getAllKeys(id);
    for (const k of keys) await tx.objectStore(store).delete(k);
  }
  const outbox = tx.objectStore('outbox');
  for (const seq of await outbox.index('byProfile').getAllKeys(id)) {
    const entry = await outbox.get(seq);
    if (entry && entry.type !== 'report' && entry.type !== 'profile-delete')
      await outbox.delete(seq);
  }
}

export async function putCards(db: Database, cards: CardRecord[]): Promise<void> {
  if (!cards.length) return;
  const tx = db.transaction(['cards', 'outbox'], 'readwrite');
  for (const card of cards) {
    const record = { ...card, updatedAt: stamp() };
    await tx.objectStore('cards').put(record);
    await enqueue(tx, {
      key: `card:${card.profileId}:${card.cardId}`,
      type: 'card',
      profileId: card.profileId,
      record,
    });
  }
  await tx.done;
}

export async function putLesson(
  db: Database,
  lesson: Omit<LessonProgressRecord, 'updatedAt'>,
): Promise<void> {
  const record: LessonProgressRecord = { ...lesson, updatedAt: stamp() };
  const tx = db.transaction(['lessons', 'outbox'], 'readwrite');
  await tx.objectStore('lessons').put(record);
  await enqueue(tx, {
    key: `lesson:${lesson.profileId}:${lesson.n}`,
    type: 'lesson',
    profileId: lesson.profileId,
    record,
  });
  await tx.done;
}

export async function getCards(db: Database, profileId: string): Promise<CardRecord[]> {
  return db.getAllFromIndex('cards', 'byProfile', profileId);
}

export async function getLessons(db: Database, profileId: string): Promise<LessonProgressRecord[]> {
  return db.getAllFromIndex('lessons', 'byProfile', profileId);
}

export async function queueReport(
  db: Database,
  input: Omit<ReportRecord, 'id' | 'createdAt'>,
): Promise<ReportRecord> {
  const record: ReportRecord = { ...input, id: newId(), createdAt: Date.now() };
  const tx = db.transaction('outbox', 'readwrite');
  await tx.store.add({
    key: `report:${record.id}`,
    type: 'report',
    profileId: record.profileId,
    record,
  });
  await tx.done;
  return record;
}

export async function pendingCount(db: Database): Promise<number> {
  return db.count('outbox');
}
