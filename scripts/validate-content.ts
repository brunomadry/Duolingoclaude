/**
 * Validates every file in content/ (schemas + cross references).
 * Usage: npm run validate:content  (exits 1 on any error)
 */
import { existsSync, readFileSync } from 'node:fs';
import { validateContent } from '../src/shared/content-validate.ts';

const dir = new URL('../content/', import.meta.url);

function load(name: string, required = false): unknown {
  const url = new URL(name, dir);
  if (!existsSync(url)) {
    if (required) throw new Error(`content/${name} is required`);
    return undefined;
  }
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
}

const report = validateContent({
  curriculum: load('curriculum.json', true),
  sources: load('SOURCES.json', true),
  kana: load('kana.json'),
  vocab: load('vocab.json'),
  glosses: load('glosses.pl.json'),
  sentences: load('sentences.json'),
  grammar: load('grammar.json'),
  strokes: load('strokes.json'),
});

for (const w of report.warnings) console.warn(`warn  ${w}`);
for (const e of report.errors) console.error(`error ${e}`);

if (report.errors.length) {
  console.error(`\nContent validation failed with ${report.errors.length} error(s).`);
  process.exit(1);
}
console.log(`Content OK (${report.warnings.length} warning(s)).`);
