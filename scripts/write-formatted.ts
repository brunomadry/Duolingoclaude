/**
 * Writes a generated file through Prettier (with the repo config), so script output always
 * passes `npm run format:check` without a manual formatting step.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

export async function writeFormatted(url: URL, text: string): Promise<void> {
  const filepath = fileURLToPath(url);
  const options = (await resolveConfig(filepath)) ?? {};
  writeFileSync(url, await format(text, { ...options, filepath }));
}

export const writeJson = (url: URL, value: unknown): Promise<void> =>
  writeFormatted(url, JSON.stringify(value, null, 2));
