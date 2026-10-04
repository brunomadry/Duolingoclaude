import { describe, expect, it } from 'vitest';
import type { CardRecord, ProfileRecord } from '../shared/api.ts';
import { planProfileMerge, recordsToApply, remoteWins } from './merge.ts';

const P = (id: string, updatedAt: number, over: Partial<ProfileRecord> = {}): ProfileRecord => ({
  id,
  name: id,
  avatar: 'plain',
  settings: {
    pace: 'daily',
    theme: 'dark',
    romaji: 'auto',
    sound: true,
    timeZone: 'Europe/Warsaw',
  },
  createdAt: 0,
  updatedAt,
  deletedAt: null,
  ...over,
});

const C = (cardId: string, updatedAt: number, v = 0): CardRecord => ({
  profileId: 'p',
  cardId,
  data: { v },
  updatedAt,
  deleted: false,
});

describe('remoteWins', () => {
  it('takes newer remote records and keeps newer local ones', () => {
    expect(remoteWins(undefined, { updatedAt: 1 })).toBe(true);
    expect(remoteWins({ updatedAt: 1 }, { updatedAt: 2 })).toBe(true);
    expect(remoteWins({ updatedAt: 3 }, { updatedAt: 2 })).toBe(false);
  });

  it('lets the server win exact ties so devices converge', () => {
    expect(remoteWins({ updatedAt: 5 }, { updatedAt: 5 })).toBe(true);
  });
});

describe('recordsToApply', () => {
  const key = (c: CardRecord) => c.cardId;

  it('applies only records that win and skips identical ones (idempotent)', () => {
    const local = new Map([
      ['a', C('a', 10, 1)],
      ['b', C('b', 10, 1)],
      ['c', C('c', 10, 1)],
    ]);
    const remote = [C('a', 11, 2), C('b', 9, 0), C('c', 10, 1), C('d', 1, 0)];
    expect(recordsToApply(remote, local, key).map((c) => c.cardId)).toEqual(['a', 'd']);
  });

  it('is idempotent: applying the result again changes nothing', () => {
    const local = new Map<string, CardRecord>();
    const remote = [C('a', 1), C('b', 2)];
    const first = recordsToApply(remote, local, key);
    for (const r of first) local.set(r.cardId, r);
    expect(recordsToApply(remote, local, key)).toEqual([]);
  });

  it('is order independent for the final state', () => {
    const apply = (batches: CardRecord[][]) => {
      const local = new Map<string, CardRecord>();
      for (const batch of batches)
        for (const r of recordsToApply(batch, local, key)) local.set(r.cardId, r);
      return local.get('a');
    };
    const x = [C('a', 5, 1)];
    const y = [C('a', 7, 2)];
    expect(apply([x, y])).toEqual(apply([y, x]));
    expect(apply([x, y])?.data).toEqual({ v: 2 });
  });
});

describe('planProfileMerge', () => {
  it('puts new and newer server profiles, keeps newer local edits', () => {
    const plan = planProfileMerge(
      [P('a', 5), P('b', 9, { name: 'local' })],
      [P('a', 6, { name: 'server' }), P('b', 8), P('c', 1)],
      new Set(),
    );
    expect(plan.put.map((p) => p.id)).toEqual(['a', 'c']);
    expect(plan.remove).toEqual([]);
  });

  it('removes profiles tombstoned on the server', () => {
    const plan = planProfileMerge([P('a', 5)], [P('a', 6, { deletedAt: 6 })], new Set(['a']));
    expect(plan.remove).toEqual(['a']);
    expect(plan.put).toEqual([]);
  });

  it('keeps offline-created profiles with pending changes, drops unknown ones without', () => {
    const plan = planProfileMerge([P('new', 5), P('gone', 5)], [], new Set(['new']));
    expect(plan.remove).toEqual(['gone']);
  });
});
