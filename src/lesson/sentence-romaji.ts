/**
 * Romaji for a whole sentence from its tokens (src/shared/jp-words.ts): particles as
 * pronounced (は wa, へ e, を o), words in their dictionary romaji when not inflected, a
 * space between tokens and Western punctuation. Used by the content pipeline, which stores
 * the result with each example sentence.
 */
import type { Token } from '../shared/jp-words.ts';
import { kanaToRomaji } from './romaji.ts';

const PUNCT: Readonly<Record<string, string>> = {
  '。': '.',
  '、': ',',
  '？': '?',
  '！': '!',
  '「': '"',
  '」': '"',
  '・': ' ',
  '～': '~',
};

const PARTICLES: Readonly<Record<string, string>> = { wa: 'wa', e: 'e', wo: 'o' };

export function sentenceRomaji(
  tokens: readonly Token[],
  romajiOfWord: (id: string) => { kana: string; romaji: string } | undefined,
): string {
  const parts: string[] = [];
  let previous: Token | undefined;
  /** Kana of the number being read (さん, then さんびゃく, then さんびゃくえん). */
  let number = '';
  for (const t of tokens) {
    const after = previous;
    previous = t;
    if (!t.surface.trim()) continue;
    // A number and its counter are one word, romanised together: sanji, ippun, gohyakuen.
    if (t.numeral && after?.numeral && parts.length > 0) {
      number += t.surface;
      parts[parts.length - 1] = ` ${kanaToRomaji(number)}`;
      continue;
    }
    number = t.numeral ? t.surface : '';
    if (t.kind === 'punct') {
      const p = PUNCT[t.surface] ?? t.surface;
      if (p === '"' && !parts.at(-1)?.endsWith(' ')) parts.push(` ${p}`);
      else parts.push(p);
      continue;
    }
    let text: string;
    const particle = t.kind === 'grammar' && t.grammar ? PARTICLES[t.grammar] : undefined;
    const word = t.kind === 'word' && t.wordIds[0] ? romajiOfWord(t.wordIds[0]) : undefined;
    if (particle) text = particle;
    else if (t.kind === 'grammar' && /^(dewa|ja)-/.test(t.grammar ?? ''))
      // では/じゃ + ありません, ない...: two words, and this は is pronounced wa.
      text = `${t.grammar?.startsWith('dewa') ? 'dewa' : 'ja'} ${kanaToRomaji(t.surface.slice(2))}`;
    else if (word && word.kana === t.surface) text = word.romaji;
    else text = kanaToRomaji(t.surface);
    parts.push(` ${text.replace(/masendeshita$/, 'masen deshita')}`);
  }
  const joined = parts.join('').replace(/\s+/g, ' ').trim();
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
