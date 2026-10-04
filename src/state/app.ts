/**
 * App controller: owns the database, the API client, the sync engine and the
 * observable app state. Screens call these functions; they never talk to the API.
 */
import { ApiError, createApi } from '../lib/api.ts';
import { openDatabase, type Database } from '../data/db.ts';
import * as repo from '../data/repo.ts';
import { backupFileName, buildBackup, importBackup, parseBackup } from '../data/backup.ts';
import { createSyncEngine, type SyncEngine, type SyncOutcome } from '../sync/engine.ts';
import { applyTheme } from '../theme/theme.ts';
import type { ProfileRecord, ProfileSettings } from '../shared/api.ts';
import type { AvatarId } from '../shared/avatars.ts';
import { createStore } from './store.ts';

const UNLOCKED_KEY = 'aka.unlocked';
const LAST_PROFILE_KEY = 'aka.lastProfile';
const SYNC_DEBOUNCE_MS = 1500;
const SYNC_INTERVAL_MS = 5 * 60_000;

export type Phase = 'booting' | 'locked' | 'ready' | 'broken';

export interface AppState {
  phase: Phase;
  online: boolean;
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  lastProfileId: string | null;
  sync: { status: SyncOutcome | 'syncing' | 'idle'; lastSyncedAt: number | null; pending: number };
  /** Bumped whenever local learning data changes, so views re-read IndexedDB. */
  dataVersion: number;
  updateAvailable: boolean;
}

export const appState = createStore<AppState>({
  phase: 'booting',
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  profiles: [],
  activeProfileId: null,
  lastProfileId: null,
  sync: { status: 'idle', lastSyncedAt: null, pending: 0 },
  dataVersion: 0,
  updateAvailable: false,
});

let db: Database | null = null;
let sync: SyncEngine | null = null;
const api = createApi();
let syncTimer: ReturnType<typeof setTimeout> | undefined;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the app still works for this session.
  }
}

export function database(): Database {
  if (!db) throw new Error('database not open');
  return db;
}

export function activeProfile(): ProfileRecord | null {
  const s = appState.get();
  return s.profiles.find((p) => p.id === s.activeProfileId) ?? null;
}

async function refreshProfiles(): Promise<void> {
  const profiles = await repo.listProfiles(database());
  const { activeProfileId } = appState.get();
  const stillActive = activeProfileId && profiles.some((p) => p.id === activeProfileId);
  appState.set((s) => ({
    profiles,
    activeProfileId: stillActive ? activeProfileId : null,
    dataVersion: s.dataVersion + 1,
  }));
  const active = profiles.find((p) => p.id === activeProfileId);
  if (active) applyTheme(active.settings.theme);
}

async function refreshPending(): Promise<void> {
  const pending = await repo.pendingCount(database());
  appState.set((s) => ({ sync: { ...s.sync, pending } }));
}

function lock(): void {
  storageSet(UNLOCKED_KEY, null);
  appState.set({ phase: 'locked', activeProfileId: null });
}

/** Runs a sync now (if online and unlocked). Safe to call often. */
export async function syncNow(): Promise<SyncOutcome | null> {
  const s = appState.get();
  if (!sync || s.phase !== 'ready') return null;
  if (!navigator.onLine) {
    appState.set((st) => ({ sync: { ...st.sync, status: 'offline' } }));
    return 'offline';
  }
  appState.set((st) => ({ sync: { ...st.sync, status: 'syncing' } }));
  const outcome = await sync.run(appState.get().activeProfileId);
  appState.set((st) => ({
    sync: {
      ...st.sync,
      status: outcome,
      lastSyncedAt: outcome === 'ok' ? Date.now() : st.sync.lastSyncedAt,
    },
  }));
  await refreshPending();
  return outcome;
}

/** Debounced sync after local writes. */
export function scheduleSync(): void {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
  void refreshPending();
}

export async function boot(): Promise<void> {
  try {
    db = await openDatabase();
  } catch (e) {
    console.error('IndexedDB unavailable', e);
    appState.set({ phase: 'broken' });
    return;
  }
  sync = createSyncEngine(db, api, {
    onLocked: lock,
    onPulled: () => void refreshProfiles(),
  });

  appState.set({ lastProfileId: storageGet(LAST_PROFILE_KEY) });
  await refreshProfiles();
  await refreshPending();
  appState.set({ phase: storageGet(UNLOCKED_KEY) === '1' ? 'ready' : 'locked' });

  window.addEventListener('online', () => {
    appState.set({ online: true });
    void syncNow();
  });
  window.addEventListener('offline', () => {
    appState.set((s) => ({ online: false, sync: { ...s.sync, status: 'offline' } }));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, SYNC_INTERVAL_MS);

  if (appState.get().phase === 'ready') void syncNow();
}

export type UnlockResult = 'ok' | 'wrong' | 'offline' | { retryAfterSeconds: number } | 'error';

export async function unlock(code: string): Promise<UnlockResult> {
  try {
    await api.unlock(code);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'locked') return 'wrong';
      if (e.code === 'offline') return 'offline';
      if (e.code === 'rate_limited') return { retryAfterSeconds: e.retryAfterSeconds ?? 900 };
    }
    return 'error';
  }
  storageSet(UNLOCKED_KEY, '1');
  appState.set({ phase: 'ready' });
  await syncNow();
  return 'ok';
}

export function selectProfile(id: string): void {
  const profile = appState.get().profiles.find((p) => p.id === id);
  if (!profile) return;
  storageSet(LAST_PROFILE_KEY, id);
  applyTheme(profile.settings.theme);
  appState.set({ activeProfileId: id, lastProfileId: id });
  void syncNow();
}

export function leaveProfile(): void {
  appState.set({ activeProfileId: null });
}

export async function createProfile(name: string, avatar: AvatarId, settings: ProfileSettings) {
  const profile = await repo.createProfile(database(), { name, avatar, settings });
  await refreshProfiles();
  scheduleSync();
  return profile;
}

export async function updateProfile(
  id: string,
  patch: { name?: string; avatar?: AvatarId; settings?: Partial<ProfileSettings> },
): Promise<void> {
  const next = await repo.updateProfile(database(), id, patch);
  if (next && id === appState.get().activeProfileId) applyTheme(next.settings.theme);
  await refreshProfiles();
  scheduleSync();
}

export async function deleteProfile(id: string): Promise<void> {
  await repo.deleteProfile(database(), id);
  if (appState.get().lastProfileId === id) {
    storageSet(LAST_PROFILE_KEY, null);
    appState.set({ lastProfileId: null });
  }
  await refreshProfiles();
  scheduleSync();
}

/** Shares (iOS share sheet) or downloads the profile backup. */
export async function exportProfile(id: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const backup = await buildBackup(database(), id);
  const name = backupFileName(backup);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Fall through to a plain download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export async function importProfileFile(file: File): Promise<string> {
  const backup = await parseBackup(await file.text());
  const id = await importBackup(database(), backup);
  await refreshProfiles();
  scheduleSync();
  return id;
}

export async function reportProblem(input: {
  sentence: string;
  note: string;
  context: string;
  lessonN?: number | null;
}): Promise<void> {
  await repo.queueReport(database(), {
    profileId: appState.get().activeProfileId,
    lessonN: input.lessonN ?? null,
    sentence: input.sentence,
    note: input.note,
    context: input.context,
  });
  scheduleSync();
}

/** Called by repositories of later phases after writing cards or lessons. */
export function notifyLocalChange(): void {
  appState.set((s) => ({ dataVersion: s.dataVersion + 1 }));
  scheduleSync();
}
