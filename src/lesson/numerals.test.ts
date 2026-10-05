import { describe, expect, it } from 'vitest';
import { toKanjiNumber } from './numerals.ts';

describe('toKanjiNumber', () => {
  it.each([
    [1, '一'],
    [7, '七'],
    [10, '十'],
    [11, '十一'],
    [20, '二十'],
    [21, '二十一'],
    [99, '九十九'],
    [100, '百'],
  ])('%i -> %s', (n, expected) => expect(toKanjiNumber(n)).toBe(expected));

  it('rejects out of range', () => {
    expect(() => toKanjiNumber(0)).toThrow();
    expect(() => toKanjiNumber(101)).toThrow();
  });
});
