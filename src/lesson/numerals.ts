/** Japanese numerals for 1..100, used on hanko seals (十二, 九十九, 百). */
const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function toKanjiNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new RangeError(`unsupported number ${n}`);
  if (n === 100) return '百';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tensPart = tens === 0 ? '' : tens === 1 ? '十' : `${DIGITS[tens]}十`;
  return `${tensPart}${DIGITS[ones]}`;
}
