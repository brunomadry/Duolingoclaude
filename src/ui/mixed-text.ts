/** Splits Polish text into runs, marking the Japanese ones (kana, kanji, ー). */
const JAPANESE_RUN = /([぀-ヿ㐀-䶿一-鿿ｦ-ﾟ々〆ー]+)/;

export function splitJapanese(text: string): { text: string; ja: boolean }[] {
  return text
    .split(JAPANESE_RUN)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, ja: JAPANESE_RUN.test(part) }));
}
