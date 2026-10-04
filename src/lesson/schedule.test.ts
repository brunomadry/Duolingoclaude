import { describe, expect, it } from 'vitest';
import { describeNextUnlock, localDaysBetween } from './schedule.ts';

const TZ = 'Europe/Warsaw';
// 2026-10-04 20:00 Warsaw (CEST, UTC+2) = 18:00 UTC
const NOW = Date.UTC(2026, 9, 4, 18, 0);
const MIDNIGHT_5TH = Date.UTC(2026, 9, 4, 22, 0); // 2026-10-05 00:00 Warsaw
const MIDNIGHT_6TH = Date.UTC(2026, 9, 5, 22, 0);

describe('describeNextUnlock', () => {
  it('counts local calendar days', () => {
    expect(localDaysBetween(NOW, MIDNIGHT_5TH, TZ)).toBe(1);
    expect(localDaysBetween(NOW, MIDNIGHT_6TH, TZ)).toBe(2);
  });

  it('says tomorrow, the day after, or in N days', () => {
    expect(
      describeNextUnlock({ nextN: 5, nextUnlocked: false, unlocksAt: MIDNIGHT_5TH }, NOW, TZ),
    ).toMatch(/jutro/);
    expect(
      describeNextUnlock({ nextN: 5, nextUnlocked: false, unlocksAt: MIDNIGHT_6TH }, NOW, TZ),
    ).toMatch(/pojutrze/);
    expect(
      describeNextUnlock(
        { nextN: 5, nextUnlocked: false, unlocksAt: MIDNIGHT_6TH + 86_400_000 },
        NOW,
        TZ,
      ),
    ).toMatch(/za 3 dni/);
  });

  it('handles unlocked and finished states', () => {
    expect(describeNextUnlock({ nextN: 3, nextUnlocked: true, unlocksAt: null }, NOW, TZ)).toBe(
      'Lekcja 3 już czeka.',
    );
    expect(
      describeNextUnlock({ nextN: null, nextUnlocked: false, unlocksAt: null }, NOW, TZ),
    ).toMatch(/ostatnia/);
  });
});
