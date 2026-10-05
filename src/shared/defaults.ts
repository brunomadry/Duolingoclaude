/**
 * Zod-free values shared by client and Worker. The client may import this module
 * at runtime; src/shared/api.ts (zod schemas) must only be imported as types or lazily.
 */
import type { ProfileSettings } from './api.ts';

export const MAX_NAME_LENGTH = 24;
export const MAX_SYNC_BATCH = 500;
/** Longest line in an AI conversation (the learner types romaji, which is never shorter). */
export const MAX_CHAT_LINE = 120;

export function defaultSettings(timeZone: string): ProfileSettings {
  return { pace: 'daily', theme: 'dark', romaji: 'auto', sound: true, timeZone };
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';
  } catch {
    return 'Europe/Warsaw';
  }
}
