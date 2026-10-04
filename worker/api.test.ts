import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1Shim } from '../tests/d1-shim.ts';
import type { Env } from './env.ts';
import { app } from './index.ts';
import { hardDeleteExpired, HARD_DELETE_AFTER_MS } from './routes/profiles.ts';
import type {
  CardRecord,
  ProfileRecord,
  ProfilesResponse,
  StateResponse,
  SyncResponse,
} from '../src/shared/api.ts';
import { signAccessToken } from './auth.ts';

const CODE = 'sakura-2026';
const SECRET = 'a'.repeat(64);
const PID = '11111111-2222-4333-8444-555555555555';
const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);

let db: D1Shim;
let env: Env;

function makeEnv(): Env {
  return {
    DB: db as unknown as D1Database,
    ASSETS: {} as Fetcher,
    APP_ACCESS_CODE: CODE,
    COOKIE_SECRET: SECRET,
  };
}

async function call(path: string, init: RequestInit & { json?: unknown } = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set('cookie', cookie);
  if (init.json !== undefined) headers.set('content-type', 'application/json');
  headers.set('cf-connecting-ip', headers.get('cf-connecting-ip') ?? '203.0.113.7');
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;
  return app.request(`http://localhost${path}`, { ...init, headers, body }, env);
}

async function unlock(): Promise<string> {
  const res = await call('/api/unlock', { method: 'POST', json: { code: CODE } });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/SameSite=Strict/i);
  return setCookie.split(';')[0]!;
}

function profile(over: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: PID,
    name: 'Ola',
    avatar: 'scarf',
    settings: {
      pace: 'daily',
      theme: 'dark',
      romaji: 'auto',
      sound: true,
      timeZone: 'Europe/Warsaw',
    },
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    ...over,
  };
}

function card(over: Partial<CardRecord> = {}): CardRecord {
  return {
    profileId: PID,
    cardId: 'kana:あ',
    data: { due: 1 },
    updatedAt: T0,
    deleted: false,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 + 60_000);
  db = new D1Shim();
  env = makeEnv();
});

afterEach(() => vi.useRealTimers());

describe('access control', () => {
  it('serves health without a cookie but locks everything else', async () => {
    expect((await call('/api/health')).status).toBe(200);
    const res = await call('/api/profiles');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'locked' });
  });

  it('rejects a wrong code and accepts the right one', async () => {
    const bad = await call('/api/unlock', { method: 'POST', json: { code: 'nope' } });
    expect(bad.status).toBe(401);
    const cookie = await unlock();
    expect((await call('/api/session', {}, cookie)).status).toBe(200);
  });

  it('rate limits unlock attempts per IP', async () => {
    for (let i = 0; i < 10; i++) {
      await call('/api/unlock', { method: 'POST', json: { code: 'nope' } });
    }
    const res = await call('/api/unlock', { method: 'POST', json: { code: CODE } });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    // Another IP is not affected.
    const other = await call('/api/unlock', {
      method: 'POST',
      json: { code: CODE },
      headers: { 'cf-connecting-ip': '198.51.100.1' },
    });
    expect(other.status).toBe(200);
  });

  it('invalidates cookies when the access code changes', async () => {
    const cookie = await unlock();
    env = { ...env, APP_ACCESS_CODE: 'new-code' };
    expect((await call('/api/session', {}, cookie)).status).toBe(401);
  });

  it('rejects tampered and expired cookies', async () => {
    const cookie = await unlock();
    expect((await call('/api/session', {}, cookie.slice(0, -2) + 'xx')).status).toBe(401);
    const old = await signAccessToken(CODE, SECRET, T0 - 401 * 24 * 3600_000);
    expect((await call('/api/session', {}, `aka_access=${old}`)).status).toBe(401);
  });

  it('requires JSON for mutations', async () => {
    const cookie = await unlock();
    const res = await call(
      '/api/profiles',
      {
        method: 'POST',
        body: 'name=x',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      },
      cookie,
    );
    expect(res.status).toBe(400);
  });
});

describe('profiles', () => {
  it('creates idempotently, lists, patches and soft deletes', async () => {
    const cookie = await unlock();
    expect((await call('/api/profiles', { method: 'POST', json: profile() }, cookie)).status).toBe(
      201,
    );
    expect((await call('/api/profiles', { method: 'POST', json: profile() }, cookie)).status).toBe(
      201,
    );

    let list = (await (await call('/api/profiles', {}, cookie)).json()) as ProfilesResponse;
    expect(list.profiles).toHaveLength(1);

    const patched = await call(
      `/api/profiles/${PID}`,
      {
        method: 'PATCH',
        json: { name: 'Ola K', settings: { theme: 'light' }, updatedAt: T0 + 10 },
      },
      cookie,
    );
    const p = (await patched.json()) as ProfileRecord;
    expect(p.name).toBe('Ola K');
    expect(p.settings.theme).toBe('light');
    expect(p.settings.pace).toBe('daily');

    expect((await call(`/api/profiles/${PID}`, { method: 'DELETE' }, cookie)).status).toBe(200);
    list = (await (await call('/api/profiles', {}, cookie)).json()) as ProfilesResponse;
    expect(list.profiles[0]!.deletedAt).not.toBeNull();

    // The tombstone wins: a later edit does not resurrect the profile.
    await call(
      '/api/profiles',
      { method: 'POST', json: profile({ updatedAt: T0 + 50_000 }) },
      cookie,
    );
    list = (await (await call('/api/profiles', {}, cookie)).json()) as ProfilesResponse;
    expect(list.profiles[0]!.deletedAt).not.toBeNull();
    expect((await call(`/api/profiles/${PID}/state`, {}, cookie)).status).toBe(410);
  });

  it('flags timestamps from a clock far in the future as clock_skew', async () => {
    const cookie = await unlock();
    const res = await call(
      '/api/profiles',
      { method: 'POST', json: profile({ updatedAt: T0 + 3 * 24 * 3600_000 }) },
      cookie,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'clock_skew' });
  });

  it('validates shapes strictly', async () => {
    const cookie = await unlock();
    const bad = [
      { ...profile(), avatar: 'shifu' },
      { ...profile(), name: '' },
      { ...profile(), name: 'x'.repeat(40) },
      { ...profile(), extra: 1 },
      { ...profile(), updatedAt: T0 + 3 * 24 * 3600_000 },
    ];
    for (const body of bad) {
      expect((await call('/api/profiles', { method: 'POST', json: body }, cookie)).status).toBe(
        400,
      );
    }
  });
});

describe('sync', () => {
  async function setup() {
    const cookie = await unlock();
    await call('/api/profiles', { method: 'POST', json: profile() }, cookie);
    const push = async (changes: unknown[]) =>
      (await (
        await call(`/api/profiles/${PID}/sync`, { method: 'POST', json: { changes } }, cookie)
      ).json()) as SyncResponse;
    const pull = async (since?: number) =>
      (await (
        await call(
          `/api/profiles/${PID}/state${since === undefined ? '' : `?since=${since}`}`,
          {},
          cookie,
        )
      ).json()) as StateResponse;
    return { cookie, push, pull };
  }

  it('applies last write wins per record and is idempotent', async () => {
    const { push, pull } = await setup();
    expect(
      await push([{ kind: 'card', record: card({ updatedAt: T0 + 5, data: { v: 'b' } }) }]),
    ).toMatchObject({
      applied: 1,
    });
    // Replay: no change.
    expect(
      await push([{ kind: 'card', record: card({ updatedAt: T0 + 5, data: { v: 'b' } }) }]),
    ).toMatchObject({
      applied: 0,
      ignored: 1,
    });
    // Older write loses.
    await push([{ kind: 'card', record: card({ updatedAt: T0 + 1, data: { v: 'old' } }) }]);
    // Newer write wins.
    await push([{ kind: 'card', record: card({ cardId: 'kana:い', updatedAt: T0 + 9 }) }]);
    const state = await pull();
    const byId = Object.fromEntries(state.cards.map((c) => [c.cardId, c]));
    expect(byId['kana:あ']!.data).toEqual({ v: 'b' });
    expect(byId['kana:い']).toBeDefined();
  });

  it('stores lesson completions and returns only changes since a pull', async () => {
    const { push, pull } = await setup();
    await push([
      {
        kind: 'lesson',
        record: { profileId: PID, n: 1, completedAt: T0, score: 0.9, updatedAt: T0 },
      },
    ]);
    const first = await pull(0);
    expect(first.lessons).toHaveLength(1);

    vi.setSystemTime(T0 + 3_600_000);
    const later = await pull(first.serverTime + 10 * 60_000);
    expect(later.lessons).toHaveLength(0);

    await push([{ kind: 'card', record: card({ updatedAt: T0 + 3_600_000 }) }]);
    const next = await pull(first.serverTime + 10 * 60_000);
    expect(next.cards).toHaveLength(1);
    expect(next.lessons).toHaveLength(0);
  });

  it('rejects records for another profile and oversized batches', async () => {
    const { cookie, push } = await setup();
    const other = '99999999-2222-4333-8444-555555555555';
    const res = await call(
      `/api/profiles/${PID}/sync`,
      { method: 'POST', json: { changes: [{ kind: 'card', record: card({ profileId: other }) }] } },
      cookie,
    );
    expect(res.status).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => ({
      kind: 'card',
      record: card({ cardId: `c${i}` }),
    }));
    const big = await call(
      `/api/profiles/${PID}/sync`,
      { method: 'POST', json: { changes: many } },
      cookie,
    );
    expect(big.status).toBe(400);
    expect((await push([])).applied).toBe(0);
  });
});

describe('reports and cleanup', () => {
  it('stores reports idempotently', async () => {
    const cookie = await unlock();
    const report = {
      id: '33333333-2222-4333-8444-555555555555',
      profileId: null,
      lessonN: 3,
      sentence: 'ねこです',
      note: 'Dziwne tłumaczenie',
      context: 'settings',
      createdAt: T0,
    };
    expect((await call('/api/reports', { method: 'POST', json: report }, cookie)).status).toBe(201);
    expect((await call('/api/reports', { method: 'POST', json: report }, cookie)).status).toBe(201);
    const count = db.raw.prepare('SELECT COUNT(*) AS n FROM reports').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('hard deletes profiles soft-deleted more than 30 days ago, with their data', async () => {
    const cookie = await unlock();
    await call('/api/profiles', { method: 'POST', json: profile() }, cookie);
    await call(
      `/api/profiles/${PID}/sync`,
      { method: 'POST', json: { changes: [{ kind: 'card', record: card() }] } },
      cookie,
    );
    await call(`/api/profiles/${PID}`, { method: 'DELETE' }, cookie);
    const d1 = db as unknown as D1Database;
    expect(await hardDeleteExpired(d1, Date.now() + 1000)).toBe(0);
    expect(await hardDeleteExpired(d1, Date.now() + HARD_DELETE_AFTER_MS + 1000)).toBe(1);
    const left = db.raw.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number };
    expect(left.n).toBe(0);
  });
});
