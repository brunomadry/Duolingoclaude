import { describe, expect, it } from 'vitest';
import { hasPendingRomaji, romajiToKana } from './kana-input.ts';

describe('romajiToKana', () => {
  it.each([
    ['kakimasu', 'かきます'],
    ['watashiha', 'わたしは'],
    ['sushi', 'すし'],
    ['susi', 'すし'],
    ['tsukue', 'つくえ'],
    ['tukue', 'つくえ'],
    ['fuku', 'ふく'],
    ['huku', 'ふく'],
    ['gakkou', 'がっこう'],
    ['kitte', 'きって'],
    ['zasshi', 'ざっし'],
    ['matcha', 'まっちゃ'],
    ['maccha', 'まっちゃ'],
    ['kyou', 'きょう'],
    ['shashin', 'しゃしん'],
    ['jisho', 'じしょ'],
    ['ocha', 'おちゃ'],
    ['konnichiha', 'こんにちは'],
    ['sensei', 'せんせい'],
    ['konnichiwa', 'こんにちわ'],
    ['kinnen', 'きんねん'],
    ["kin'en", 'きんえん'],
    ["hon'ya", 'ほんや'],
    ['honnya', 'ほんにゃ'],
    ['honn', 'ほん'],
    ['minnna', 'みんな'],
    ['onna', 'おんな'],
    ['ginkou', 'ぎんこう'],
    ['shinbun', 'しんぶん'],
    ['wo', 'を'],
    ['ko-hi-', 'こーひー'],
    ['KAMERA', 'かめら'],
  ])('%s -> %s', (romaji, kana) => {
    expect(romajiToKana(romaji, { final: true })).toBe(kana);
  });

  it('keeps an unfinished syllable as letters while typing', () => {
    expect(romajiToKana('ka')).toBe('か');
    expect(romajiToKana('kak')).toBe('かk');
    expect(romajiToKana('kash')).toBe('かsh');
    expect(romajiToKana('hon')).toBe('ほn');
    expect(romajiToKana('hon', { final: true })).toBe('ほん');
    expect(romajiToKana('ny')).toBe('ny');
  });

  it('passes kana through and can output katakana', () => {
    expect(romajiToKana('ねこ')).toBe('ねこ');
    expect(romajiToKana('terebi', { katakana: true })).toBe('テレビ');
    expect(romajiToKana('ko-hi-', { katakana: true })).toBe('コーヒー');
  });

  it('reports pending romaji', () => {
    expect(hasPendingRomaji('かk')).toBe(true);
    expect(hasPendingRomaji('かき')).toBe(false);
  });
});
