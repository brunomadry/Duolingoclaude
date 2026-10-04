/**
 * Two devices (two IndexedDB databases) syncing through the real Worker app and
 * real SQL (node:sqlite). Covers the full path: local write -> outbox -> push ->
 * server LWW -> pull -> merge on the other device.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../worker/index.ts';
import type { Env } from '../worker/env.ts';
import { D1Shim } from './d1-shim.ts';
import { createApi, type Fetch } from '../src/lib/api.ts';
import { openDatabase, type Database } from '../src/data/db.ts';
import {
  createProfile,
  deleteProfile,
  getCards,
  getLessons,
  listProfiles,
  pendingCount,
  putCards,
  putLesson,
  queueReport,
  updateProfile,
} from '../src/data/repo.ts';
import { createSyncEngine, type SyncEngine } from '../src/sync/engine.ts';
import { defaultSettings } from '../src/shared/defaults.ts';

const CODE = 'momiji';
let env: Env;
let d1: D1Shim;
let online = true;
let dbCounter = 0;

async function cookieFor(): Promise<string> {
  const res = await app.request(
    'http://localhost/api/unlock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '127.0.0.1' },
      body: JSON.stringify({ code: CODE }),
    },
    env,
  );
  return (res.headers.get('set-cookie') ?? '').split(';')[0]!;
}

async function device(): Promise<{ db: Database; sync: SyncEngine; locked: () => boolean }> {
  const cookie = await cookieFor();
  const fetchImpl: Fetch = async (input, init) => {
    if (!online) throw new TypeError('Failed to fetch');
    const headers = new Headers(init?.headers);
    headers.set('cookie', cookie);
    headers.set('cf-connecting-ip', '127.0.0.1');
    return app.request(`http://localhost${String(input)}`, { ...init, headers }, env);
  };
  const db = await openDatabase(`test-${++dbCounter}`);
  let wasLocked = false;
  const sync = createSyncEngine(db, createApi(fetchImpl), { onLocked: () => (wasLocked = true) });
  return { db, sync, locked: () => wasLocked };
}

beforeEach(() => {
  d1 = new D1Shim();
  env = {
    DB: d1 as unknown as D1Database,
    ASSETS: {} as Fetcher,
    APP_ACCESS_CODE: CODE,
    COOKIE_SECRET: 'b'.repeat(64),
  };
  online = true;
});

afterEach(() => vi.useRealTimers());

describe('two-device sync', () => {
  it('moves a profile, cards and lesson progress from one device to another', async () => {
    const a = await device();
    const b = await device();

    const p = await createProfile(a.db, {
      name: 'Kuba',
      avatar: 'hat',
      settings: defaultSettings('Europe/Warsaw'),
    });
    await putCards(a.db, [
      { profileId: p.id, cardId: 'kana:あ', data: { s: 1 }, updatedAt: 0, deleted: false },
    ]);
    await putLesson(a.db, { profileId: p.id, n: 1, completedAt: Date.now(), score: 1 });
    expect(await pendingCount(a.db)).toBe(3);

    expect(await a.sync.run(p.id)).toBe('ok');
    expect(await pendingCount(a.db)).toBe(0);

    expect(await b.sync.run(p.id)).toBe('ok');
    expect((await listProfiles(b.db)).map((x) => x.name)).toEqual(['Kuba']);
    expect(await getCards(b.db, p.id)).toHaveLength(1);
    expect(await getLessons(b.db, p.id)).toHaveLength(1);
  });

  it('works offline and catches up on reconnect', async () => {
    const a = await device();
    online = false;
    const p = await createProfile(a.db, {
      name: 'Ola',
      avatar: 'leaf',
      settings: defaultSettings('Europe/Warsaw'),
    });
    expect(await a.sync.run(p.id)).toBe('offline');
    expect(await listProfiles(a.db)).toHaveLength(1);
    expect(await pendingCount(a.db)).toBe(1);

    online = true;
    expect(await a.sync.run(p.id)).toBe('ok');
    const b = await device();
    await b.sync.run(null);
    expect(await listProfiles(b.db)).toHaveLength(1);
  });

  it('resolves conflicting edits with last write wins and converges', async () => {
    const a = await device();
    const b = await device();
    const p = await createProfile(a.db, {
      name: 'Ola',
      avatar: 'leaf',
      settings: defaultSettings('Europe/Warsaw'),
    });
    await a.sync.run(p.id);
    await b.sync.run(p.id);

    // Both edit offline; B edits later.
    await updateProfile(a.db, p.id, { name: 'Ola A' });
    await new Promise((r) => setTimeout(r, 5));
    await updateProfile(b.db, p.id, { name: 'Ola B', settings: { theme: 'light' } });

    await a.sync.run(p.id);
    await b.sync.run(p.id);
    await a.sync.run(p.id);

    const [pa] = await listProfiles(a.db);
    const [pb] = await listProfiles(b.db);
    expect(pa!.name).toBe('Ola B');
    expect(pb!.name).toBe('Ola B');
    expect(pa!.settings.theme).toBe('light');
  });

  it('is idempotent: re-running sync changes nothing', async () => {
    const a = await device();
    const p = await createProfile(a.db, {
      name: 'X',
      avatar: 'plain',
      settings: defaultSettings('Europe/Warsaw'),
    });
    await putCards(a.db, [
      { profileId: p.id, cardId: 'c1', data: {}, updatedAt: 0, deleted: false },
    ]);
    await a.sync.run(p.id);
    const before = JSON.stringify(await getCards(a.db, p.id));
    await a.sync.run(p.id);
    await a.sync.run(p.id);
    expect(JSON.stringify(await getCards(a.db, p.id))).toBe(before);
    const rows = d1.raw.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it('propagates deletion to other devices', async () => {
    const a = await device();
    const b = await device();
    const p = await createProfile(a.db, {
      name: 'Del',
      avatar: 'plain',
      settings: defaultSettings('Europe/Warsaw'),
    });
    await a.sync.run(p.id);
    await b.sync.run(p.id);
    expect(await listProfiles(b.db)).toHaveLength(1);

    await deleteProfile(a.db, p.id);
    await a.sync.run(null);
    await b.sync.run(p.id);
    expect(await listProfiles(b.db)).toHaveLength(0);
    expect(await getCards(b.db, p.id)).toHaveLength(0);
  });

  it('pushes queued error reports', async () => {
    const a = await device();
    await queueReport(a.db, {
      profileId: null,
      lessonN: 2,
      sentence: 'かさ',
      note: 'test',
      context: 'settings',
    });
    await a.sync.run(null);
    const rows = d1.raw.prepare('SELECT COUNT(*) AS n FROM reports').get() as { n: number };
    expect(rows.n).toBe(1);
    expect(await pendingCount(a.db)).toBe(0);
  });

  it('keeps changes queued when the device clock runs far ahead', async () => {
    const a = await device();
    const p = await createProfile(a.db, {
      name: 'Zegar',
      avatar: 'plain',
      settings: defaultSettings('Europe/Warsaw'),
    });
    await a.sync.run(p.id);
    // A card written while the phone clock was three days ahead.
    await a.db.add('outbox', {
      key: `card:${p.id}:future`,
      type: 'card',
      profileId: p.id,
      record: {
        profileId: p.id,
        cardId: 'future',
        data: {},
        updatedAt: Date.now() + 3 * 24 * 3600_000,
        deleted: false,
      },
    });
    expect(await a.sync.run(p.id)).toBe('clock');
    expect(await pendingCount(a.db)).toBe(1);
  });

  it('reports a lost session as locked and keeps local data', async () => {
    const a = await device();
    const p = await createProfile(a.db, {
      name: 'L',
      avatar: 'plain',
      settings: defaultSettings('Europe/Warsaw'),
    });
    env = { ...env, APP_ACCESS_CODE: 'rotated' };
    expect(await a.sync.run(p.id)).toBe('locked');
    expect(a.locked()).toBe(true);
    expect(await pendingCount(a.db)).toBe(1);
  });
});
