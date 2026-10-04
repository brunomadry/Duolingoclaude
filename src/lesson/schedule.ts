/** Polish wording for "when does the next lesson unlock", from computeUnlock results. */
import { TOTAL_LESSONS } from '../shared/constants.ts';
import { localDayKey } from './unlock.ts';

export interface UnlockView {
  nextN: number | null;
  nextUnlocked: boolean;
  unlocksAt: number | null;
}

function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Calendar days between two instants, counted in the profile's time zone. */
export function localDaysBetween(from: number, to: number, timeZone: string): number {
  return dayIndex(localDayKey(to, timeZone)) - dayIndex(localDayKey(from, timeZone));
}

export function describeNextUnlock(u: UnlockView, now: number, timeZone: string): string {
  if (u.nextN === null)
    return `To była ostatnia lekcja. Cały kurs (${TOTAL_LESSONS} lekcji) za Tobą!`;
  if (u.nextUnlocked || u.unlocksAt === null) return `Lekcja ${u.nextN} już czeka.`;
  const days = localDaysBetween(now, u.unlocksAt, timeZone);
  const when = days <= 1 ? 'jutro' : days === 2 ? 'pojutrze' : `za ${days} dni`;
  return `Lekcja ${u.nextN} odblokuje się ${when}. Do tego czasu możesz robić powtórki.`;
}
