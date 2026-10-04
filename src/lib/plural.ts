/** Polish plural: plural(1, 'słówko', 'słówka', 'słówek') -> "1 słówko"; 2 słówka; 5 słówek; 22 słówka. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}
