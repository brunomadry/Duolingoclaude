import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { BackupError, backupFileName, buildBackup, importBackup, parseBackup } from './backup.ts';
import { createProfile, getCards, getLessons, listProfiles, putCards, putLesson } from './repo.ts';
import { defaultSettings } from '../shared/defaults.ts';

let n = 0;
const fresh = () => openDatabase(`backup-${++n}`);

async function seeded() {
  const db = await fresh();
  const p = await createProfile(db, {
    name: 'Zoë Łąka',
    avatar: 'sakura',
    settings: defaultSettings('Europe/Warsaw'),
  });
  await putCards(db, [
    { profileId: p.id, cardId: 'kana:あ', data: { s: 1 }, updatedAt: 0, deleted: false },
    { profileId: p.id, cardId: 'kana:い', data: { s: 2 }, updatedAt: 0, deleted: false },
  ]);
  await putLesson(db, { profileId: p.id, n: 1, completedAt: 1, score: 0.8 });
  return { db, p };
}

describe('backup', () => {
  it('round-trips through JSON into a new device as a new profile', async () => {
    const { db, p } = await seeded();
    const text = JSON.stringify(await buildBackup(db, p.id));
    const other = await fresh();
    const id = await importBackup(other, await parseBackup(text));
    expect(id).not.toBe(p.id);
    const [imported] = await listProfiles(other);
    expect(imported!.name).toBe('Zoë Łąka');
    expect(await getCards(other, id)).toHaveLength(2);
    expect(await getLessons(other, id)).toHaveLength(1);
  });

  it('merges into the same live profile without duplicating it', async () => {
    const { db, p } = await seeded();
    const backup = await parseBackup(JSON.stringify(await buildBackup(db, p.id)));
    expect(await importBackup(db, backup)).toBe(p.id);
    expect(await listProfiles(db)).toHaveLength(1);
    expect(await getCards(db, p.id)).toHaveLength(2);
  });

  it('rejects garbage and foreign files with a Polish message', async () => {
    await expect(parseBackup('nope')).rejects.toBeInstanceOf(BackupError);
    await expect(parseBackup('{"app":"other"}')).rejects.toThrow(/Aka Nihongo/);
  });

  it('builds a safe file name', async () => {
    const { db, p } = await seeded();
    const name = backupFileName(await buildBackup(db, p.id));
    expect(name).toMatch(/^aka-nihongo-Zoe-Laka-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
