/**
 * Background sync. IndexedDB is the source the UI reads; this engine pushes the
 * outbox in batches and pulls server changes, merging with last-write-wins.
 * Runs are serialized; calling `run()` while a run is active returns the same promise.
 */
import { ApiError, type Api } from '../lib/api.ts';
import type { Change } from '../shared/api.ts';
import { MAX_SYNC_BATCH } from '../shared/defaults.ts';
import { getMeta, setMeta, type Database, type OutboxEntry } from '../data/db.ts';
import { removeLocalProfileData } from '../data/repo.ts';
import { planProfileMerge, recordsToApply } from './merge.ts';

export type SyncOutcome = 'ok' | 'offline' | 'locked' | 'error';

export interface SyncHooks {
  /** The server rejected the access cookie: show the access code screen. */
  onLocked?: () => void;
  /** Local data changed because of a pull (refresh the UI). */
  onPulled?: () => void;
  /** A queued change was dropped because the server refused it permanently. */
  onDropped?: (entry: OutboxEntry, error: ApiError) => void;
}

const lastPullKey = (profileId: string) => `lastPull:${profileId}`;

type Entry = OutboxEntry & { seq: number };

export function createSyncEngine(db: Database, api: Api, hooks: SyncHooks = {}) {
  let running: Promise<SyncOutcome> | null = null;

  async function drop(entries: Entry[], error: ApiError): Promise<void> {
    const tx = db.transaction('outbox', 'readwrite');
    for (const e of entries) await tx.store.delete(e.seq);
    await tx.done;
    for (const e of entries) hooks.onDropped?.(e, error);
  }

  async function done(entries: Entry[]): Promise<void> {
    const tx = db.transaction('outbox', 'readwrite');
    for (const e of entries) {
      // Only delete if it is still the same queued version (a newer one gets a new seq).
      if (await tx.store.get(e.seq)) await tx.store.delete(e.seq);
    }
    await tx.done;
  }

  async function forgetProfile(id: string): Promise<void> {
    const tx = db.transaction(['profiles', 'cards', 'lessons', 'outbox', 'meta'], 'readwrite');
    await removeLocalProfileData(tx, id);
    await tx.objectStore('meta').delete(lastPullKey(id));
    await tx.done;
  }

  /** Errors that mean "stop this run" are rethrown; permanent refusals drop the entries. */
  async function attempt(entries: Entry[], fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
      await done(entries);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (
        e.code === 'offline' ||
        e.code === 'locked' ||
        e.code === 'rate_limited' ||
        e.code === 'server_error'
      ) {
        throw e;
      }
      const profileId = entries[0]?.profileId;
      if ((e.code === 'gone' || e.code === 'not_found') && profileId) {
        await drop(entries, e);
        await forgetProfile(profileId);
        return;
      }
      await drop(entries, e);
    }
  }

  async function push(): Promise<void> {
    const entries = (await db.getAll('outbox')) as Entry[];
    if (!entries.length) return;

    // 1. Profiles first, so the server knows them before their cards arrive.
    for (const e of entries) {
      if (e.type === 'profile') await attempt([e], () => api.putProfile(e.record));
    }
    // 2. Deletions.
    for (const e of entries) {
      if (e.type === 'profile-delete') {
        await attempt([e], async () => {
          try {
            await api.deleteProfile(e.profileId);
          } catch (err) {
            if (err instanceof ApiError && err.code === 'not_found') return;
            throw err;
          }
        });
      }
    }
    // 3. Cards and lesson progress, batched per profile.
    const byProfile = new Map<string, Entry[]>();
    for (const e of entries) {
      if (e.type === 'card' || e.type === 'lesson') {
        const list = byProfile.get(e.profileId) ?? [];
        list.push(e);
        byProfile.set(e.profileId, list);
      }
    }
    for (const [profileId, list] of byProfile) {
      for (let i = 0; i < list.length; i += MAX_SYNC_BATCH) {
        const batch = list.slice(i, i + MAX_SYNC_BATCH);
        const changes = batch.map((e) =>
          e.type === 'card'
            ? ({ kind: 'card', record: e.record } as Change)
            : ({
                kind: 'lesson',
                record: (e as Extract<Entry, { type: 'lesson' }>).record,
              } as Change),
        );
        await attempt(batch, () => api.pushChanges(profileId, changes));
      }
    }
    // 4. Error reports.
    for (const e of entries) {
      if (e.type === 'report') await attempt([e], () => api.sendReport(e.record));
    }
  }

  async function pullProfiles(): Promise<boolean> {
    const res = await api.listProfiles();
    const outbox = await db.getAll('outbox');
    const pending = new Set(
      outbox.filter((e) => e.type !== 'report').map((e) => e.profileId ?? ''),
    );
    const pendingDeletes = new Set(
      outbox.filter((e) => e.type === 'profile-delete').map((e) => e.profileId),
    );
    const local = await db.getAll('profiles');
    const plan = planProfileMerge(
      local,
      res.profiles.filter((p) => !pendingDeletes.has(p.id)),
      pending,
    );
    if (plan.put.length) {
      const tx = db.transaction('profiles', 'readwrite');
      for (const p of plan.put) await tx.store.put(p);
      await tx.done;
    }
    for (const id of plan.remove) await forgetProfile(id);
    return plan.put.length > 0 || plan.remove.length > 0;
  }

  async function pullState(profileId: string): Promise<boolean> {
    const since = (await getMeta<number>(db, lastPullKey(profileId))) ?? 0;
    let res;
    try {
      res = await api.pullState(profileId, since);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'gone' || e.code === 'not_found')) {
        await forgetProfile(profileId);
        return true;
      }
      throw e;
    }

    const tx = db.transaction(['profiles', 'cards', 'lessons', 'meta'], 'readwrite');
    let changed = false;

    const localProfile = await tx.objectStore('profiles').get(profileId);
    if (
      recordsToApply(
        [res.profile],
        new Map(localProfile ? [[profileId, localProfile]] : []),
        (p) => p.id,
      ).length
    ) {
      await tx.objectStore('profiles').put(res.profile);
      changed = true;
    }

    const cardStore = tx.objectStore('cards');
    for (const card of res.cards) {
      const local = await cardStore.get([profileId, card.cardId]);
      const apply = recordsToApply(
        [card],
        new Map(local ? [[card.cardId, local]] : []),
        (c) => c.cardId,
      );
      if (apply.length) {
        await cardStore.put(card);
        changed = true;
      }
    }
    const lessonStore = tx.objectStore('lessons');
    for (const lesson of res.lessons) {
      const local = await lessonStore.get([profileId, lesson.n]);
      const apply = recordsToApply(
        [lesson],
        new Map(local ? [[String(lesson.n), local]] : []),
        (l) => String(l.n),
      );
      if (apply.length) {
        await lessonStore.put(lesson);
        changed = true;
      }
    }
    await tx.objectStore('meta').put({ key: lastPullKey(profileId), value: res.serverTime });
    await tx.done;
    return changed;
  }

  async function runOnce(activeProfileId: string | null): Promise<SyncOutcome> {
    try {
      await push();
      let changed = await pullProfiles();
      if (activeProfileId && (await db.get('profiles', activeProfileId))) {
        changed = (await pullState(activeProfileId)) || changed;
      }
      await setMeta(db, 'lastSyncedAt', Date.now());
      if (changed) hooks.onPulled?.();
      return 'ok';
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'offline') return 'offline';
        if (e.code === 'locked') {
          hooks.onLocked?.();
          return 'locked';
        }
      }
      console.warn('sync failed', e);
      return 'error';
    }
  }

  return {
    run(activeProfileId: string | null): Promise<SyncOutcome> {
      if (!running) {
        running = runOnce(activeProfileId).finally(() => {
          running = null;
        });
      }
      return running;
    },
    push,
    pullProfiles,
    pullState,
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
