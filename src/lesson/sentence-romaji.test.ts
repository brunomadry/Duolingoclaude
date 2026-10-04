import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLexicon, tokenize, type LexEntry } from '../shared/jp-words.ts';
import { sentenceRomaji } from './sentence-romaji.ts';

const vocab = (
  JSON.parse(readFileSync(new URL('../../content/vocab.json', import.meta.url), 'utf8')) as {
    words: (LexEntry & { romaji: string })[];
  }
).words;
const lexicon = createLexicon(vocab.map((w) => ({ ...w, pos: w.pos ?? [] })));
const byId = new Map(vocab.map((w) => [w.id, w]));
const romaji = (kana: string) => sentenceRomaji(tokenize(kana, lexicon), (id) => byId.get(id));

describe('sentenceRomaji', () => {
  it('reads particles as pronounced', () => {
    expect(romaji('わたしは ポーランドじんです。')).toBe('Watashi wa poorandojin desu.');
    expect(romaji('がっこうへ いきます。')).toBe('Gakkou e ikimasu.');
    expect(romaji('ほんを よみます。')).toBe('Hon o yomimasu.');
  });

  it('keeps lexicalised spellings and handles では', () => {
    expect(romaji('こんにちは。')).toBe('Konnichiwa.');
    expect(romaji('がくせいではありません。')).toBe('Gakusei dewa arimasen.');
    expect(romaji('がくせいじゃありませんでした。')).toBe('Gakusei ja arimasen deshita.');
    expect(romaji('たべませんでした。')).toBe('Tabemasen deshita.');
  });

  it('turns Japanese punctuation into Western punctuation', () => {
    expect(romaji('ねこですか？')).toBe('Neko desu ka?');
    expect(romaji('いぬと、ねこ。')).toBe('Inu to, neko.');
  });
});
