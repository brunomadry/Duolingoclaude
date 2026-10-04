import { describe, expect, it } from 'vitest';
import { splitJapanese } from './mixed-text.ts';

describe('splitJapanese', () => {
  it('marks Japanese runs inside Polish text', () => {
    expect(splitJapanese('Hamak z は, a obok ハ.')).toEqual([
      { text: 'Hamak z ', ja: false },
      { text: 'は', ja: true },
      { text: ', a obok ', ja: false },
      { text: 'ハ', ja: true },
      { text: '.', ja: false },
    ]);
  });

  it('keeps Polish letters and handles pure strings', () => {
    expect(splitJapanese('Zażółć')).toEqual([{ text: 'Zażółć', ja: false }]);
    expect(splitJapanese('コーヒー')).toEqual([{ text: 'コーヒー', ja: true }]);
    expect(splitJapanese('')).toEqual([]);
  });
});
