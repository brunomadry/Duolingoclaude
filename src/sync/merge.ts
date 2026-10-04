/**
 * Pure merge rules for sync. Conflict policy: last write wins per record on
 * `updatedAt` (client clock). On an exact tie the server copy wins, which mirrors
 * the server keeping the first arrival, so every device converges to one value.
 * Applying the same remote record twice is a no-op (idempotent).
 */
import type { ProfileRecord } from '../shared/api.ts';

export interface Versioned {
  updatedAt: number;
}

export function remoteWins<T extends Versioned>(local: T | undefined, remote: T): boolean {
  return local === undefined || remote.updatedAt >= local.updatedAt;
}

/** Returns the records from `remote` that should overwrite the local copies. */
export function recordsToApply<T extends Versioned>(
  remote: readonly T[],
  localByKey: ReadonlyMap<string, T>,
  keyOf: (r: T) => string,
): T[] {
  return remote.filter((r) => {
    const local = localByKey.get(keyOf(r));
    if (local && JSON.stringify(local) === JSON.stringify(r)) return false;
    return remoteWins(local, r);
  });
}

export interface ProfileMergePlan {
  put: ProfileRecord[];
  /** Profiles to drop locally together with their cards, lessons and outbox. */
  remove: string[];
}

/**
 * Merges the server's full profile list into the local one.
 * - a server tombstone (deletedAt) removes the profile everywhere,
 * - a profile the server does not know is kept only if it still has unsent changes
 *   (created offline); otherwise it was hard deleted on the server.
 */
export function planProfileMerge(
  local: readonly ProfileRecord[],
  remote: readonly ProfileRecord[],
  pendingProfileIds: ReadonlySet<string>,
): ProfileMergePlan {
  const localById = new Map(local.map((p) => [p.id, p]));
  const remoteIds = new Set(remote.map((p) => p.id));
  const put: ProfileRecord[] = [];
  const remove: string[] = [];

  for (const r of remote) {
    if (r.deletedAt !== null) {
      if (localById.has(r.id)) remove.push(r.id);
      continue;
    }
    const l = localById.get(r.id);
    if (l && JSON.stringify(l) === JSON.stringify(r)) continue;
    if (remoteWins(l, r)) put.push(r);
  }
  for (const l of local) {
    if (!remoteIds.has(l.id) && !pendingProfileIds.has(l.id)) remove.push(l.id);
  }
  return { put, remove };
}
