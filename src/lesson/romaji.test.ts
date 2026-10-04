import { describe, expect, it } from 'vitest';
import { isRomajiAnswerCorrect, kanaToRomaji, romajiDisplay } from './romaji.ts';

describe('romajiDisplay', () => {
  it('auto shows romaji up to lesson 16, then hides it behind a tap', () => {
    expect(romajiDisplay('auto', 1)).toBe('show');
    expect(romajiDisplay('auto', 16)).toBe('show');
    expect(romajiDisplay('auto', 17)).toBe('tap');
    expect(romajiDisplay('auto', 100)).toBe('tap');
  });

  it('always and never ignore the lesson', () => {
    expect(romajiDisplay('always', 90)).toBe('show');
    expect(romajiDisplay('never', 1)).toBe('off');
  });
});

describe('kanaToRomaji (Modified Hepburn, no macrons)', () => {
  it.each([
    // basic rows
    ['あいうえお', 'aiueo'],
    ['かきくけこ', 'kakikukeko'],
    ['さしすせそ', 'sashisuseso'],
    ['たちつてと', 'tachitsuteto'],
    ['なにぬねの', 'naninuneno'],
    ['はひふへほ', 'hahifuheho'],
    ['まみむめも', 'mamimumemo'],
    ['やゆよ', 'yayuyo'],
    ['らりるれろ', 'rarirurero'],
    ['わをん', 'wao' + 'n'],
    // dakuten and handakuten
    ['がぎぐげご', 'gagigugego'],
    ['ざじずぜぞ', 'zajizuzezo'],
    ['だぢづでど', 'dajizudedo'],
    ['ばびぶべぼ', 'babibubebo'],
    ['ぱぴぷぺぽ', 'papipupepo'],
    // yoon
    ['きゃきゅきょ', 'kyakyukyo'],
    ['しゃしゅしょ', 'shashusho'],
    ['ちゃちゅちょ', 'chachucho'],
    ['じゃじゅじょ', 'jajujo'],
    ['にゃ', 'nya'],
    ['ひょう', 'hyou'],
    ['りゅ', 'ryu'],
    ['ぴゃ', 'pya'],
    // small tsu
    ['きって', 'kitte'],
    ['がっこう', 'gakkou'],
    ['まっちゃ', 'matcha'],
    ['いっしょ', 'issho'],
    ['ざっし', 'zasshi'],
    ['みっつ', 'mittsu'],
    ['あっ', 'a'],
    // n before vowels and y
    ['きんえん', "kin'en"],
    ['ほんや', "hon'ya"],
    ['こんにちは', 'konnichiha'],
    ['しんぶん', 'shinbun'],
    ['せんせい', 'sensei'],
    // katakana, long vowels, extended sounds
    ['カタカナ', 'katakana'],
    ['コーヒー', 'koohii'],
    ['ラーメン', 'raamen'],
    ['ケーキ', 'keeki'],
    ['パーティー', 'paatii'],
    ['ファン', 'fan'],
    ['ヴァイオリン', 'vaiorin'],
    ['ウィンドウ', 'windou'],
    ['シェフ', 'shefu'],
    ['ジェット', 'jetto'],
    ['チェック', 'chekku'],
    ['ディスク', 'disuku'],
    ['ベッド', 'beddo'],
    ['ツアー', 'tsuaa'],
    // mixed and passthrough
    ['ねこ と イヌ', 'neko to inu'],
    ['東京', '東京'],
    ['', ''],
  ])('%s -> %s', (kana, romaji) => {
    expect(kanaToRomaji(kana)).toBe(romaji);
  });
});

describe('isRomajiAnswerCorrect', () => {
  it.each([
    ['shi', 'し'],
    ['si', 'し'],
    ['chi', 'ち'],
    ['ti', 'ち'],
    ['tsu', 'つ'],
    ['tu', 'つ'],
    ['fu', 'ふ'],
    ['hu', 'ふ'],
    ['ji', 'じ'],
    ['zi', 'じ'],
    ['o', 'を'],
    ['wo', 'を'],
    ['n', 'ん'],
    ['nn', 'ん'],
    ['sha', 'しゃ'],
    ['sya', 'しゃ'],
    ['cha', 'ちゃ'],
    ['tya', 'ちゃ'],
    ['ja', 'じゃ'],
    ['zya', 'じゃ'],
    ['kka', 'っか'],
    ['tchi', 'っち'],
    ['cchi', 'っち'],
    ['KA', 'か'],
    ['  ka ', 'か'],
    ['kaa', 'カー'],
    ['ka-', 'カー'],
    ['kā', 'カー'],
    ['koohii', 'コーヒー'],
    ['kōhī', 'コーヒー'],
    ['ko-hi-', 'コーヒー'],
    ["kin'en", 'きんえん'],
    ['kinnen', 'きんえん'],
    ['gakkou', 'がっこう'],
    ['gakkoo', 'がっこう'],
    ['gakkō', 'がっこう'],
    ['shimbun', 'しんぶん'],
    ['shinbun', 'しんぶん'],
  ])('accepts %s for %s', (input, kana) => {
    expect(isRomajiAnswerCorrect(input, kana)).toBe(true);
  });

  it.each([
    ['', 'か'],
    ['   ', 'か'],
    ['ga', 'か'],
    ['ka', 'カー'],
    ['ki', 'きゃ'],
    ['kiya', 'きゃ'],
    ['tsu', 'す'],
    ['wa', 'は'],
    ['ee', 'えい'],
    ['kat', 'か'],
    ['kakaka', 'か'],
  ])('rejects %j for %s', (input, kana) => {
    expect(isRomajiAnswerCorrect(input, kana)).toBe(false);
  });
});
