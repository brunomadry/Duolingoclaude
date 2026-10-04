import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLexicon, tokenize, type LexEntry } from '../shared/jp-words.ts';
import { analyseSentence, interchangeable, tilesMatch } from './sentences.ts';

const vocab = (
  JSON.parse(readFileSync(new URL('../../content/vocab.json', import.meta.url), 'utf8')) as {
    words: LexEntry[];
  }
).words;
const lexicon = createLexicon(vocab.map((w) => ({ ...w, pos: w.pos ?? [] })));
const pos = new Map(vocab.map((w) => [w.id, w.pos ?? []]));
const isVerb = (id: string) => (pos.get(id) ?? []).some((p) => /^v[15ksz]/.test(p));

const analyse = (kana: string, ja = kana) =>
  analyseSentence({ id: 'ex:x', ja, kana, pl: 'x', lesson: 30 }, tokenize(kana, lexicon), isVerb);

describe('analyseSentence', () => {
  it('splits the reading into tiles and finds particle gaps', () => {
    const s = analyse('わたしは ポーランドじんです。', '私はポーランド人です。');
    expect(s.tiles).toEqual(['わたし', 'は', 'ポーランドじん', 'です']);
    expect(s.gaps).toEqual([{ index: 1, key: 'wa' }]);
    expect(s.words).toEqual(['watashi', 'poorandojin']);
    expect(s.grammar).toEqual(['wa-desu']);
  });

  it('collects the grammar of particles and inflections', () => {
    const s = analyse('がっこうへ いきました。');
    expect(s.gaps).toEqual([{ index: 1, key: 'e' }]);
    expect(s.grammar.sort()).toEqual(['masen-mashita', 'ni-he']);
    // A verb in its dictionary form needs the plain-form lesson.
    expect(analyse('ほんを よむ。').grammar.sort()).toEqual(['masu-wo', 'plain-dictionary']);
  });

  it('falls back to ja when there is no separate reading', () => {
    const s = analyseSentence(
      { id: 'ex:y', ja: 'ねこです。', pl: 'To kot.', lesson: 17 },
      tokenize('ねこです。', lexicon),
      isVerb,
    );
    expect(s.kana).toBe('ねこです。');
    expect(s.tiles).toEqual(['ねこ', 'です']);
  });
});

describe('helpers', () => {
  it('knows which particles may both be right', () => {
    expect(interchangeable('ni', 'e')).toBe(true);
    expect(interchangeable('e', 'ni')).toBe(true);
    expect(interchangeable('wo', 'ni')).toBe(false);
  });

  it('compares tile sequences', () => {
    expect(tilesMatch(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(tilesMatch(['b', 'a'], ['a', 'b'])).toBe(false);
    expect(tilesMatch(['a'], ['a', 'b'])).toBe(false);
  });
});
