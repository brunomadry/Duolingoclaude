import { afterEach, describe, expect, it } from 'vitest';
import { computeUnlock, localDayKey, startOfLocalDay } from './unlock.ts';
import type { LessonCompletion, Pace, UnlockInput } from './unlock.ts';

const WARSAW = 'Europe/Warsaw';
const at = (iso: string) => Date.parse(iso);
const done = (n: number, iso: string): LessonCompletion => ({ n, completedAt: at(iso) });

/** Local wall clock of an instant, e.g. "2026-03-30 00:00:00", for readable assertions. */
function wall(ms: number, timeZone: string): string {
  const f = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return f.format(ms);
}

function unlock(
  completions: LessonCompletion[],
  now: string,
  pace: Pace = 'daily',
  timeZone = WARSAW,
  totalLessons?: number,
) {
  const input: UnlockInput = { completions, pace, timeZone, now: at(now) };
  if (totalLessons !== undefined) input.totalLessons = totalLessons;
  return computeUnlock(input);
}

describe('computeUnlock basics', () => {
  it('opens lesson 1 when nothing is completed', () => {
    expect(unlock([], '2026-10-04T12:00:00+02:00')).toEqual({
      completedCount: 0,
      nextN: 1,
      nextUnlocked: true,
      unlocksAt: null,
    });
  });

  it('keeps lesson 1 open even if only later lessons have records', () => {
    const r = unlock([done(2, '2026-10-01T10:00:00+02:00')], '2026-10-01T11:00:00+02:00');
    expect(r).toEqual({ completedCount: 1, nextN: 1, nextUnlocked: true, unlocksAt: null });
  });

  it('reports the end of the course', () => {
    const all = Array.from({ length: 100 }, (_, i) => done(i + 1, `2026-01-01T10:00:00+01:00`));
    expect(unlock(all, '2026-10-04T12:00:00+02:00')).toEqual({
      completedCount: 100,
      nextN: null,
      nextUnlocked: false,
      unlocksAt: null,
    });
  });

  it('respects a custom totalLessons', () => {
    const three = [1, 2, 3].map((n) => done(n, '2026-10-01T10:00:00+02:00'));
    expect(unlock(three, '2026-10-01T11:00:00+02:00', 'daily', WARSAW, 3).nextN).toBeNull();
    expect(unlock(three, '2026-10-01T11:00:00+02:00', 'daily', WARSAW, 4).nextN).toBe(4);
  });

  it('takes lessons in order and counts distinct completions', () => {
    const r = unlock(
      [
        done(3, '2026-10-03T10:00:00+02:00'),
        done(1, '2026-10-01T10:00:00+02:00'),
        done(5, '2026-10-04T09:00:00+02:00'),
        done(2, '2026-10-02T10:00:00+02:00'),
      ],
      '2026-10-03T20:00:00+02:00',
    );
    expect(r.completedCount).toBe(4);
    expect(r.nextN).toBe(4);
    // The timer runs from lesson 3, not from the stray lesson 5 record.
    expect(r.nextUnlocked).toBe(false);
    expect(r.unlocksAt).toBe(at('2026-10-04T00:00:00+02:00'));
  });

  it('uses the latest record when a lesson appears twice', () => {
    const completions = [
      done(1, '2026-10-01T10:00:00+02:00'),
      done(2, '2026-10-05T09:00:00+02:00'),
      done(2, '2026-10-02T09:00:00+02:00'),
    ];
    const r = unlock(completions, '2026-10-05T12:00:00+02:00');
    expect(r.completedCount).toBe(2);
    expect(r.nextN).toBe(3);
    expect(r.unlocksAt).toBe(at('2026-10-06T00:00:00+02:00'));
  });

  it('ignores invalid records', () => {
    const r = unlock(
      [
        done(1, '2026-10-01T10:00:00+02:00'),
        { n: 0, completedAt: at('2026-10-01T10:00:00+02:00') },
        { n: 2.5, completedAt: at('2026-10-01T10:00:00+02:00') },
        { n: 101, completedAt: at('2026-10-01T10:00:00+02:00') },
        { n: 2, completedAt: Number.NaN },
      ],
      '2026-10-01T11:00:00+02:00',
    );
    expect(r).toEqual({
      completedCount: 1,
      nextN: 2,
      nextUnlocked: false,
      unlocksAt: at('2026-10-02T00:00:00+02:00'),
    });
  });

  it('treats an unknown pace as daily', () => {
    const input = {
      completions: [done(1, '2026-10-04T10:00:00+02:00')],
      pace: 'weekly' as Pace,
      timeZone: WARSAW,
      now: at('2026-10-04T11:00:00+02:00'),
    };
    expect(computeUnlock(input).unlocksAt).toBe(at('2026-10-05T00:00:00+02:00'));
  });
});

describe('computeUnlock in Europe/Warsaw', () => {
  it('opens at the next local midnight after a 23:59 completion, not 24 hours later', () => {
    const completions = [done(1, '2026-10-04T23:59:00+02:00')];
    const before = unlock(completions, '2026-10-04T23:59:59.999+02:00');
    expect(before).toEqual({
      completedCount: 1,
      nextN: 2,
      nextUnlocked: false,
      unlocksAt: at('2026-10-05T00:00:00+02:00'),
    });
    const after = unlock(completions, '2026-10-05T00:00:00+02:00');
    expect(after).toEqual({ completedCount: 1, nextN: 2, nextUnlocked: true, unlocksAt: null });
  });

  it('waits for the following midnight after a 00:01 completion', () => {
    const completions = [done(1, '2026-10-05T00:01:00+02:00')];
    const r = unlock(completions, '2026-10-05T23:00:00+02:00');
    expect(r.nextUnlocked).toBe(false);
    expect(r.unlocksAt).toBe(at('2026-10-06T00:00:00+02:00'));
    expect(unlock(completions, '2026-10-06T00:00:00+02:00').nextUnlocked).toBe(true);
  });

  it('waits two local midnights in relaxed pace', () => {
    const late = [done(1, '2026-10-04T23:59:00+02:00')];
    expect(unlock(late, '2026-10-05T12:00:00+02:00', 'relaxed').unlocksAt).toBe(
      at('2026-10-06T00:00:00+02:00'),
    );
    const early = [done(1, '2026-10-05T00:01:00+02:00')];
    const r = unlock(early, '2026-10-06T23:59:59+02:00', 'relaxed');
    expect(r.nextUnlocked).toBe(false);
    expect(r.unlocksAt).toBe(at('2026-10-07T00:00:00+02:00'));
    expect(unlock(early, '2026-10-07T00:00:00+02:00', 'relaxed').nextUnlocked).toBe(true);
  });

  it('lands on local midnight around spring forward (29 March 2026, 02:00 -> 03:00)', () => {
    // Completed the evening before the change: the change day starts at 00:00 CET.
    const eve = unlock([done(1, '2026-03-28T21:00:00+01:00')], '2026-03-28T22:00:00+01:00');
    expect(eve.unlocksAt).toBe(at('2026-03-29T00:00:00+01:00'));

    // Completed on the 23-hour day itself: the next midnight is already CEST.
    const day = unlock([done(1, '2026-03-29T01:30:00+01:00')], '2026-03-29T12:00:00+02:00');
    expect(day.unlocksAt).toBe(at('2026-03-30T00:00:00+02:00'));
    expect(wall(day.unlocksAt!, WARSAW)).toBe('2026-03-30 00:00:00');
    expect(day.unlocksAt! - at('2026-03-29T00:00:00+01:00')).toBe(23 * 3_600_000);

    const relaxed = unlock(
      [done(1, '2026-03-28T08:00:00+01:00')],
      '2026-03-28T09:00:00+01:00',
      'relaxed',
    );
    expect(relaxed.unlocksAt).toBe(at('2026-03-30T00:00:00+02:00'));
  });

  it('lands on local midnight around fall back (25 October 2026, 03:00 -> 02:00)', () => {
    const eve = unlock([done(1, '2026-10-24T20:00:00+02:00')], '2026-10-24T21:00:00+02:00');
    expect(eve.unlocksAt).toBe(at('2026-10-25T00:00:00+02:00'));

    // Both readings of 02:30 on the 25-hour day lead to the same midnight (CET).
    for (const iso of ['2026-10-25T02:30:00+02:00', '2026-10-25T02:30:00+01:00']) {
      const r = unlock([done(1, iso)], '2026-10-25T12:00:00+01:00');
      expect(r.unlocksAt).toBe(at('2026-10-26T00:00:00+01:00'));
      expect(wall(r.unlocksAt!, WARSAW)).toBe('2026-10-26 00:00:00');
    }
    expect(at('2026-10-26T00:00:00+01:00') - at('2026-10-25T00:00:00+02:00')).toBe(25 * 3_600_000);
  });

  it('opens exactly one lesson for a learner back after 10 days, without resetting', () => {
    const completions = [1, 2, 3, 4, 5].map((n) => done(n, `2026-10-0${n}T18:00:00+02:00`));
    const back = unlock(completions, '2026-10-15T09:00:00+02:00');
    expect(back).toEqual({ completedCount: 5, nextN: 6, nextUnlocked: true, unlocksAt: null });

    // Finishing lesson 6 now closes the door again until the next midnight.
    const after = unlock(
      [...completions, done(6, '2026-10-15T09:30:00+02:00')],
      '2026-10-15T09:31:00+02:00',
    );
    expect(after).toEqual({
      completedCount: 6,
      nextN: 7,
      nextUnlocked: false,
      unlocksAt: at('2026-10-16T00:00:00+02:00'),
    });
  });
});

describe('computeUnlock in other zones', () => {
  it('works in America/New_York across both DST changes', () => {
    const ny = 'America/New_York';
    // Spring forward on 8 March 2026 (02:00 EST -> 03:00 EDT).
    expect(
      unlock([done(1, '2026-03-07T21:00:00-05:00')], '2026-03-07T22:00:00-05:00', 'daily', ny)
        .unlocksAt,
    ).toBe(at('2026-03-08T00:00:00-05:00'));
    expect(
      unlock([done(1, '2026-03-08T12:00:00-04:00')], '2026-03-08T13:00:00-04:00', 'daily', ny)
        .unlocksAt,
    ).toBe(at('2026-03-09T00:00:00-04:00'));
    // Fall back on 1 November 2026 (02:00 EDT -> 01:00 EST).
    expect(
      unlock([done(1, '2026-11-01T00:30:00-04:00')], '2026-11-01T01:00:00-05:00', 'daily', ny)
        .unlocksAt,
    ).toBe(at('2026-11-02T00:00:00-05:00'));
    // 23:30 in New York is 05:30 the next day in Warsaw: the profile zone decides.
    const late = [done(1, '2026-10-04T23:30:00-04:00')];
    const now = '2026-10-05T00:30:00-04:00';
    expect(unlock(late, now, 'daily', ny)).toEqual({
      completedCount: 1,
      nextN: 2,
      nextUnlocked: true,
      unlocksAt: null,
    });
    expect(unlock(late, now, 'daily', WARSAW).unlocksAt).toBe(at('2026-10-06T00:00:00+02:00'));
  });

  it('works in Asia/Tokyo (no DST)', () => {
    const tokyo = 'Asia/Tokyo';
    const r = unlock(
      [done(1, '2026-10-04T23:59:00+09:00')],
      '2026-10-04T23:59:30+09:00',
      'daily',
      tokyo,
    );
    expect(r.unlocksAt).toBe(at('2026-10-05T00:00:00+09:00'));
    expect(r.unlocksAt).toBe(Date.UTC(2026, 9, 4, 15));
    const relaxed = unlock(
      [done(1, '2026-10-04T00:01:00+09:00')],
      '2026-10-05T12:00:00+09:00',
      'relaxed',
      tokyo,
    );
    expect(relaxed.unlocksAt).toBe(at('2026-10-06T00:00:00+09:00'));
  });

  it('starts the day at 01:00 where midnight is skipped (America/Santiago, 6 Sept 2026)', () => {
    const santiago = 'America/Santiago';
    const r = unlock(
      [done(1, '2026-09-05T20:00:00-04:00')],
      '2026-09-05T21:00:00-04:00',
      'daily',
      santiago,
    );
    expect(r.unlocksAt).toBe(at('2026-09-06T01:00:00-03:00'));
    expect(wall(r.unlocksAt!, santiago)).toBe('2026-09-06 01:00:00');
  });
});

describe('localDayKey', () => {
  it('formats the local calendar date in the given zone', () => {
    const instant = Date.UTC(2026, 9, 4, 22, 30); // 00:30 on 5 Oct in Warsaw
    expect(localDayKey(instant, WARSAW)).toBe('2026-10-05');
    expect(localDayKey(instant, 'America/New_York')).toBe('2026-10-04');
    expect(localDayKey(instant, 'Asia/Tokyo')).toBe('2026-10-05');
    expect(localDayKey(instant, 'UTC')).toBe('2026-10-04');
  });

  it('switches days exactly at local midnight', () => {
    const midnight = at('2026-10-05T00:00:00+02:00');
    expect(localDayKey(midnight - 1, WARSAW)).toBe('2026-10-04');
    expect(localDayKey(midnight, WARSAW)).toBe('2026-10-05');
  });

  it('falls back to Europe/Warsaw for an unknown zone name', () => {
    const instant = Date.UTC(2026, 9, 4, 22, 30);
    expect(localDayKey(instant, 'Mars/Olympus_Mons')).toBe(localDayKey(instant, WARSAW));
    expect(startOfLocalDay(2026, 10, 5, 'Mars/Olympus_Mons')).toBe(
      startOfLocalDay(2026, 10, 5, WARSAW),
    );
  });
});

describe('startOfLocalDay', () => {
  it('returns local midnight', () => {
    expect(startOfLocalDay(2026, 10, 5, WARSAW)).toBe(at('2026-10-05T00:00:00+02:00'));
    expect(startOfLocalDay(2026, 1, 1, WARSAW)).toBe(at('2026-01-01T00:00:00+01:00'));
    expect(startOfLocalDay(2026, 3, 29, WARSAW)).toBe(at('2026-03-29T00:00:00+01:00'));
    expect(startOfLocalDay(2026, 3, 30, WARSAW)).toBe(at('2026-03-30T00:00:00+02:00'));
    expect(startOfLocalDay(2026, 10, 25, WARSAW)).toBe(at('2026-10-25T00:00:00+02:00'));
    expect(startOfLocalDay(2026, 10, 26, WARSAW)).toBe(at('2026-10-26T00:00:00+01:00'));
    expect(startOfLocalDay(2026, 10, 5, 'Asia/Kathmandu')).toBe(at('2026-10-05T00:00:00+05:45'));
  });

  it('rolls over out-of-range days and months', () => {
    expect(startOfLocalDay(2026, 12, 32, WARSAW)).toBe(at('2027-01-01T00:00:00+01:00'));
    expect(startOfLocalDay(2026, 2, 29, WARSAW)).toBe(at('2026-03-01T00:00:00+01:00'));
    expect(startOfLocalDay(2026, 13, 1, WARSAW)).toBe(at('2027-01-01T00:00:00+01:00'));
  });

  it('starts a skipped day at the first instant after it (Pacific/Apia, 30 Dec 2011)', () => {
    // Samoa jumped from 29 to 31 December 2011; "30 December" begins when 31 December does.
    expect(startOfLocalDay(2011, 12, 30, 'Pacific/Apia')).toBe(Date.UTC(2011, 11, 30, 10));
    expect(startOfLocalDay(2011, 12, 31, 'Pacific/Apia')).toBe(Date.UTC(2011, 11, 30, 10));
  });

  it('gives the first instant of every day of 2026 in many zones', () => {
    const zones = [
      WARSAW,
      'America/New_York',
      'Asia/Tokyo',
      'America/Santiago',
      'America/Havana',
      'Australia/Lord_Howe',
      'Asia/Kolkata',
      'Pacific/Chatham',
      'America/St_Johns',
      'Pacific/Kiritimati',
      'Etc/GMT+12',
      'UTC',
    ];
    for (const zone of zones) {
      for (let i = 0; i < 365; i++) {
        const date = new Date(Date.UTC(2026, 0, 1 + i));
        const key = date.toISOString().slice(0, 10);
        const start = startOfLocalDay(2026, 1, 1 + i, zone);
        expect(localDayKey(start, zone), `${zone} ${key}`).toBe(key);
        expect(localDayKey(start - 1, zone) < key, `${zone} ${key}`).toBe(true);
      }
    }
  });

  it('is plain local midnight on every day of 2026 in Warsaw', () => {
    for (let i = 0; i < 365; i++) {
      const start = startOfLocalDay(2026, 1, 1 + i, WARSAW);
      expect(wall(start, WARSAW).slice(11)).toBe('00:00:00');
    }
  });
});

describe('independence from the machine time zone', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  function scenario() {
    const completions = [
      done(1, '2026-10-24T23:59:00+02:00'),
      done(2, '2026-10-25T02:30:00+01:00'),
    ];
    return {
      daily: unlock(completions, '2026-10-25T12:00:00+01:00'),
      relaxed: unlock(completions, '2026-10-25T12:00:00+01:00', 'relaxed'),
      tokyo: unlock(completions, '2026-10-25T12:00:00+01:00', 'daily', 'Asia/Tokyo'),
      key: localDayKey(Date.UTC(2026, 9, 24, 22, 30), WARSAW),
      start: startOfLocalDay(2026, 3, 30, WARSAW),
    };
  }

  it('returns identical results whatever process.env.TZ is', () => {
    process.env.TZ = 'UTC';
    const reference = scenario();
    expect(reference.daily.unlocksAt).toBe(at('2026-10-26T00:00:00+01:00'));
    expect(reference.relaxed.unlocksAt).toBe(at('2026-10-27T00:00:00+01:00'));
    expect(reference.key).toBe('2026-10-25');

    for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', 'Asia/Kathmandu']) {
      process.env.TZ = tz;
      // Make sure the switch really took effect, so the comparison means something.
      const offset = new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset();
      expect(offset, tz).not.toBe(0);
      expect(scenario(), tz).toEqual(reference);
    }
  });
});
