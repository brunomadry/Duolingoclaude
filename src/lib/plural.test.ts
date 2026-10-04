import { describe, expect, it } from 'vitest';
import { plural } from './plural.ts';

describe('plural', () => {
  it('follows Polish number agreement', () => {
    const w = (n: number) => plural(n, 'słówko', 'słówka', 'słówek');
    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 112, 122].map(w)).toEqual([
      '0 słówek',
      '1 słówko',
      '2 słówka',
      '4 słówka',
      '5 słówek',
      '11 słówek',
      '12 słówek',
      '14 słówek',
      '21 słówek',
      '22 słówka',
      '25 słówek',
      '112 słówek',
      '122 słówka',
    ]);
  });
});
