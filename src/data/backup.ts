/**
 * Profile export/import as a JSON file. Validation loads the zod schemas lazily so
 * they stay out of the main bundle.
 */
import type { CardRecord, LessonProgressRecord, ProfileRecord } from '../shared/api.ts';
import type { Database } from './db.ts';
import { enqueue, getCards, getLessons, newId, saveProfile, stamp } from './repo.ts';

export const BACKUP_FORMAT = 1;

export interface Backup {
  app: 'aka-nihongo';
  format: typeof BACKUP_FORMAT;
  exportedAt: number;
  profile: ProfileRecord;
  cards: CardRecord[];
  lessons: LessonProgressRecord[];
}

export async function buildBackup(db: Database, profileId: string): Promise<Backup> {
  const profile = await db.get('profiles', profileId);
  if (!profile) throw new Error('profile not found');
  return {
    app: 'aka-nihongo',
    format: BACKUP_FORMAT,
    exportedAt: Date.now(),
    profile,
    cards: await getCards(db, profileId),
    lessons: await getLessons(db, profileId),
  };
}

export function backupFileName(b: Backup): string {
  const date = new Date(b.exportedAt).toISOString().slice(0, 10);
  const safe =
    b.profile.name
      .replace(/ł/g, 'l')
      .replace(/Ł/g, 'L')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'profil';
  return `aka-nihongo-${safe}-${date}.json`;
}

export class BackupError extends Error {}

/** Parses and strictly validates a backup file. */
export async function parseBackup(text: string): Promise<Backup> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('To nie jest plik JSON.');
  }
  const { BackupSchema } = await import('./backup-schema.ts');
  const parsed = BackupSchema.safeParse(raw);
  if (!parsed.success) throw new BackupError('Plik nie wygląda na kopię z Aka Nihongo.');
  const b = parsed.data;
  if (
    b.cards.some((c) => c.profileId !== b.profile.id) ||
    b.lessons.some((l) => l.profileId !== b.profile.id)
  ) {
    throw new BackupError('Plik jest niespójny (dane innego profilu).');
  }
  return b;
}

/**
 * Imports a backup. If the same profile exists here it is merged record by record
 * (newer wins). Otherwise it becomes a new profile with a fresh id, so restoring a
 * deleted profile never collides with its server tombstone.
 * Returns the id of the profile that received the data.
 */
export async function importBackup(db: Database, b: Backup): Promise<string> {
  const existing = await db.get('profiles', b.profile.id);
  const isNew = !(existing && existing.deletedAt === null);
  const targetId = isNew ? newId() : b.profile.id;

  if (isNew) {
    const now = stamp();
    await saveProfile(db, {
      ...b.profile,
      id: targetId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  const tx = db.transaction(['cards', 'lessons', 'outbox'], 'readwrite');
  for (const card of b.cards) {
    const local = await tx.objectStore('cards').get([targetId, card.cardId]);
    if (local && local.updatedAt >= card.updatedAt) continue;
    const record = { ...card, profileId: targetId, updatedAt: isNew ? stamp() : card.updatedAt };
    await tx.objectStore('cards').put(record);
    await enqueue(tx, {
      key: `card:${targetId}:${card.cardId}`,
      type: 'card',
      profileId: targetId,
      record,
    });
  }
  for (const lesson of b.lessons) {
    const local = await tx.objectStore('lessons').get([targetId, lesson.n]);
    if (local && local.updatedAt >= lesson.updatedAt) continue;
    const record = {
      ...lesson,
      profileId: targetId,
      updatedAt: isNew ? stamp() : lesson.updatedAt,
    };
    await tx.objectStore('lessons').put(record);
    await enqueue(tx, {
      key: `lesson:${targetId}:${lesson.n}`,
      type: 'lesson',
      profileId: targetId,
      record,
    });
  }
  await tx.done;
  return targetId;
}
