/**
 * Verifies WCAG AA contrast for every token pairing in both themes.
 * Usage: npm run contrast  (exits 1 on any failure)
 */
import { readFileSync } from 'node:fs';
import { checkThemes, parseThemes } from '../src/theme/contrast.ts';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const results = checkThemes(parseThemes(css));
const failures = results.filter((r) => !r.pass);

for (const r of results) {
  const mark = r.pass ? 'ok  ' : 'FAIL';
  console.log(
    `${mark} ${r.theme.padEnd(5)} ${r.fg.padEnd(15)} on ${r.bg.padEnd(13)} ${r.ratio.toFixed(2).padStart(5)} (min ${r.min}, ${r.kind})`,
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrast check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} contrast checks passed in both themes.`);
