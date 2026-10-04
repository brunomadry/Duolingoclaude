/**
 * One-off generator for Polish glosses through the free LLM providers (Groq first, Gemini
 * fallback; see src/shared/llm.ts). Runs in batches and writes content/glosses.pl.json with
 * `reviewed: false` on every new entry. It only FILLS MISSING ids, so rerunning after a
 * human review never overwrites reviewed work; pass --force to regenerate everything.
 * Never runs at app runtime.
 *
 * Usage:
 *   GROQ_API_KEY=... GEMINI_API_KEY=... node scripts/generate-glosses.ts [--force] [--batch 40]
 *   (behind an HTTPS proxy add NODE_USE_ENV_PROXY=1; models: GROQ_MODEL, GEMINI_MODEL)
 *
 * The committed glosses were produced during development by the same kind of one-time LLM
 * pass and then reviewed entry by entry (see docs/DECISIONS.md); run the spot check after
 * any regeneration: node scripts/gloss-spot-check.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createLlm, LlmError } from '../src/shared/llm.ts';

interface Word {
  id: string;
  kana: string;
  kanji?: string;
  en: string[];
  pos?: string[];
}
type Glosses = Record<string, { pl: string[]; reviewed: boolean }>;

const SYSTEM = `You translate Japanese JLPT N5 vocabulary into short Polish dictionary glosses for beginners.
Rules: 1 to 3 short Polish senses per word, most common N5 sense first; verbs in the infinitive, adjectives in masculine singular, nouns in nominative singular; transitive/intransitive pairs must be distinguishable; counters and set phrases get a short note in parentheses; correct Polish diacritics; no English; no trailing punctuation.
Use the Japanese word as the primary source and the English gloss only as a hint.
Answer with a JSON object {"glosses": {"<id>": ["sense", ...], ...}} containing every id you were given and nothing else.`;

const { values } = parseArgs({
  options: { force: { type: 'boolean', default: false }, batch: { type: 'string', default: '40' } },
});
const batchSize = Math.max(5, Number(values.batch) || 40);

const content = new URL('../content/', import.meta.url);
const vocab = (
  JSON.parse(readFileSync(new URL('vocab.json', content), 'utf8')) as { words: Word[] }
).words;
const outUrl = new URL('glosses.pl.json', content);
const existing: Glosses = existsSync(outUrl)
  ? (JSON.parse(readFileSync(outUrl, 'utf8')) as { glosses: Glosses }).glosses
  : {};

const todo = vocab.filter((w) => values.force || !existing[w.id]);
console.log(`${todo.length} word(s) to gloss (${vocab.length - todo.length} kept).`);

const llm = createLlm({
  groqKey: process.env.GROQ_API_KEY,
  geminiKey: process.env.GEMINI_API_KEY,
  groqModel: process.env.GROQ_MODEL,
  geminiModel: process.env.GEMINI_MODEL,
  timeoutMs: 60_000,
});

const glosses: Glosses = { ...existing };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < todo.length; i += batchSize) {
  const batch = todo.slice(i, i + batchSize);
  const user = JSON.stringify(
    batch.map((w) => ({
      id: w.id,
      word: w.kanji ?? w.kana,
      reading: w.kana,
      en: w.en,
      pos: w.pos,
    })),
  );
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await llm.complete({
        system: SYSTEM,
        user,
        temperature: 0.2,
        maxTokens: 4000,
        json: true,
      });
      const parsed = JSON.parse(res.text) as { glosses?: Record<string, unknown> };
      let added = 0;
      for (const w of batch) {
        const senses = parsed.glosses?.[w.id];
        if (Array.isArray(senses) && senses.every((s) => typeof s === 'string') && senses.length) {
          glosses[w.id] = {
            pl: (senses as string[])
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 3),
            reviewed: false,
          };
          added++;
        }
      }
      console.log(
        `batch ${i / batchSize + 1}: ${added}/${batch.length} via ${res.provider} (${res.model})`,
      );
      break;
    } catch (e) {
      if (e instanceof LlmError && e.kind === 'config') {
        console.error('No AI key configured: set GROQ_API_KEY and/or GEMINI_API_KEY.');
        process.exit(1);
      }
      const wait = e instanceof LlmError && e.retryAfterMs ? e.retryAfterMs : 5_000 * attempt;
      if (attempt >= 4) throw e;
      console.warn(
        `batch ${i / batchSize + 1} failed (${e instanceof Error ? e.message : String(e)}), retrying in ${wait} ms`,
      );
      await sleep(wait);
    }
  }
  // Stay well inside free-tier per-minute limits.
  await sleep(2_500);
}

const ordered: Glosses = {};
for (const w of vocab) {
  const g = glosses[w.id];
  if (g) ordered[w.id] = g;
}
writeFileSync(outUrl, `${JSON.stringify({ version: 1, glosses: ordered }, null, 2)}\n`);
const missing = vocab.filter((w) => !ordered[w.id]).map((w) => w.id);
console.log(
  `Wrote ${Object.keys(ordered).length} glosses.${missing.length ? ` Missing: ${missing.join(', ')}` : ''}`,
);
