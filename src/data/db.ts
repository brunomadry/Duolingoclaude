/**
 * IndexedDB working copy. The UI reads and writes only here; the sync engine
 * moves changes to and from the server in the background.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  CardRecord,
  LessonProgressRecord,
  ProfileRecord,
  ReportRecord,
} from '../shared/api.ts';

export type OutboxEntry =
  | { seq?: number; key: string; type: 'profile'; profileId: string; record: ProfileRecord }
  | { seq?: number; key: string; type: 'card'; profileId: string; record: CardRecord }
  | { seq?: number; key: string; type: 'lesson'; profileId: string; record: LessonProgressRecord }
  | { seq?: number; key: string; type: 'profile-delete'; profileId: string }
  | { seq?: number; key: string; type: 'report'; profileId: string | null; record: ReportRecord };

export interface AkaDB extends DBSchema {
  profiles: { key: string; value: ProfileRecord };
  cards: {
    key: [string, string];
    value: CardRecord;
    indexes: { byProfile: string };
  };
  lessons: {
    key: [string, number];
    value: LessonProgressRecord;
    indexes: { byProfile: string };
  };
  outbox: {
    key: number;
    value: OutboxEntry;
    indexes: { byKey: string; byProfile: string };
  };
  meta: { key: string; value: { key: string; value: unknown } };
}

export const DB_NAME = 'aka-nihongo';
export const DB_VERSION = 1;

export type Database = IDBPDatabase<AkaDB>;

export function openDatabase(name = DB_NAME): Promise<Database> {
  return openDB<AkaDB>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('profiles', { keyPath: 'id' });
      const cards = db.createObjectStore('cards', { keyPath: ['profileId', 'cardId'] });
      cards.createIndex('byProfile', 'profileId');
      const lessons = db.createObjectStore('lessons', { keyPath: ['profileId', 'n'] });
      lessons.createIndex('byProfile', 'profileId');
      const outbox = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      outbox.createIndex('byKey', 'key');
      outbox.createIndex('byProfile', 'profileId');
      db.createObjectStore('meta', { keyPath: 'key' });
    },
  });
}

export async function getMeta<T>(db: Database, key: string): Promise<T | undefined> {
  return (await db.get('meta', key))?.value as T | undefined;
}

export async function setMeta(db: Database, key: string, value: unknown): Promise<void> {
  await db.put('meta', { key, value });
}
